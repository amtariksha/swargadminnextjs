// Rule-based pre-classification of a new ticket's opening message. It only suggests: the engine
// stores queue, priority, suggested_type and suggested_category, and a human confirms before
// type and category_slug are written. Keywords are data (desk_categories.keywords); the only
// literals here are the customer-app deep-link phrases and the delivery cut-off words.
// Matching is by whole token, so "add" never matches "address".

import { isAckOnly } from './ack';
import type { Priority } from './constants';

export interface PreClassifyCategory {
    slug: string;
    type: string;            // 'complaint' | 'sales' | 'request' | 'enquiry' | 'other'
    priority: number | null;
    sort_order: number | null;
    active: boolean | null;
    keywords: string[] | null;
}

export interface PreClassifyInput {
    text: string | null;                 // messages.body of the opening message
    content_type: string | null;
    has_media: boolean;                  // Boolean(messages.media_url)
    integrated_number: string | null;    // conversations.integrated_number, as stored
    number_queues: Record<string, string> | null;  // DeskSettings.number_queues; null or {} when missing or unparseable
    customer: { known: boolean; active_subscriber: boolean | null };
    is_ctwa: boolean;                    // the opening message has source === 'ctwa'
    categories: readonly PreClassifyCategory[];    // rows of desk_categories
}

export interface PreClassifyResult {
    queue: 'care' | 'sales';
    suggested_type: string | null;
    suggested_category: string | null;
    order_id_hint: string | null;        // digits only, as a string
    matched_keyword: string | null;      // first matching keyword of the suggested category; null for a deep link or CTWA
    priority: Priority;
    deadline_hint: 'before_cutoff' | null;
    is_ack_only: boolean;
    rules_fired: string[];
}

export const CUTOFF_TOKENS: readonly string[] =
    ['tomorrow', 'tmrw', 'tmr', 'kal', 'naale', 'nale', 'add', 'extra', 'stop', 'pause', 'cancel'];

const CUTOFF_PHRASES: ReadonlyArray<readonly string[]> = [['dont', 'deliver'], ['do', 'not', 'deliver'], ['no', 'delivery']];
const CTWA_CATEGORY = 'new_app_subscription';
const DEFAULT_PRIORITY = 3;

const DEEPLINK_RULES: ReadonlyArray<{ name: string; pattern: RegExp; category: string | null; hasOrder: boolean }> = [
    { name: 'deeplink_not_received_order', pattern: /\bi haven'?t received my order ?# ?(\d{1,12})\b/, category: 'not_delivered', hasOrder: true },
    { name: 'deeplink_not_received_recent', pattern: /\bi haven'?t received my recent delivery\b/, category: 'not_delivered', hasOrder: false },
    { name: 'deeplink_complaint_order', pattern: /\bi have a complaint regarding my order ?# ?(\d{1,12})\b/, category: null, hasOrder: true },
    { name: 'deeplink_complaint', pattern: /\bi have a complaint\b/, category: null, hasOrder: false },
];
const ORDER_HASH_PATTERN = /\border ?# ?(\d{1,12})\b/;

export function normaliseForMatch(text: string | null | undefined): string {
    return String(text ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[‘’ʼ`´]/g, '\'')
        .replace(/\s+/g, ' ')
        .trim();
}

export function matchTokens(text: string | null | undefined): string[] {
    return normaliseForMatch(text)
        .replace(/'/g, '')
        .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
        .trim()
        .split(' ')
        .filter((token) => token.length > 0);
}

/** True when `needle` appears as a contiguous run inside `tokens`. */
function containsRun(tokens: readonly string[], needle: readonly string[]): boolean {
    if (needle.length === 0 || needle.length > tokens.length) return false;
    for (let start = 0; start + needle.length <= tokens.length; start += 1) {
        if (needle.every((token, offset) => tokens[start + offset] === token)) return true;
    }
    return false;
}

// ── Queue ──────────────────────────────────────────────────────────────────

function digitsOf(value: string | null | undefined): string {
    return String(value ?? '').replace(/\D/g, '');
}

function queueMap(numberQueues: Record<string, string> | null): Map<string, 'care' | 'sales'> {
    const map = new Map<string, 'care' | 'sales'>();
    if (typeof numberQueues !== 'object' || numberQueues === null || Array.isArray(numberQueues)) return map;
    for (const [key, queue] of Object.entries(numberQueues)) {
        const digits = digitsOf(key);
        if (digits.length > 0 && (queue === 'care' || queue === 'sales')) map.set(digits, queue);
    }
    return map;
}

export function resolveQueueForNumber(
    integratedNumber: string | null,
    numberQueues: Record<string, string> | null,
): 'care' | 'sales' {
    const map = queueMap(numberQueues);
    const digits = digitsOf(integratedNumber);
    if (digits.length === 0) return 'care';
    const exact = map.get(digits);
    if (exact) return exact;
    if (digits.length >= 10) {
        for (const [key, queue] of map) {
            if (key.length >= 10 && key.slice(-10) === digits.slice(-10)) return queue;
        }
    }
    return 'care';
}

// ── Suggestions ────────────────────────────────────────────────────────────

interface Suggestion {
    type: string | null;
    category: string | null;
    orderId: string | null;
    keyword: string | null;
    fired: string[];
}

/** Rules 2a-2d: the first deep-link phrase that matches. */
function matchDeepLink(normalised: string): Suggestion | null {
    for (const rule of DEEPLINK_RULES) {
        const match = rule.pattern.exec(normalised);
        if (match) {
            return { type: 'complaint', category: rule.category, orderId: rule.hasOrder ? match[1] : null, keyword: null, fired: [rule.name] };
        }
    }
    return null;
}

/** Rules 2a-2e: deep links first, then a typed "order #N" when no order id has been found yet. */
function suggestFromText(normalised: string): Suggestion {
    const deepLink = matchDeepLink(normalised);
    const base: Suggestion = deepLink ?? { type: null, category: null, orderId: null, keyword: null, fired: [] };
    if (base.orderId !== null) return base;
    const hash = ORDER_HASH_PATTERN.exec(normalised);
    return hash ? { ...base, orderId: hash[1], fired: [...base.fired, 'order_hash'] } : base;
}

function isActive(category: PreClassifyCategory): boolean {
    return category.active !== false;
}

function matchedKeywords(tokens: readonly string[], category: PreClassifyCategory): string[] {
    const found: string[] = [];
    for (const keyword of category.keywords ?? []) {
        const keywordTokens = matchTokens(keyword);
        const form = keywordTokens.join(' ');
        if (containsRun(tokens, keywordTokens) && !found.includes(form)) found.push(form);
    }
    return found;
}

/** Section 6.4: most distinct keyword hits; ties by lower priority number, lower sort_order, smaller slug. */
function bestKeywordCategory(
    tokens: readonly string[],
    categories: readonly PreClassifyCategory[],
): { category: PreClassifyCategory; keyword: string } | null {
    const hits = categories
        .filter(isActive)
        .map((category) => ({ category, keywords: matchedKeywords(tokens, category) }))
        .filter((entry) => entry.keywords.length > 0);
    hits.sort((a, b) => (
        b.keywords.length - a.keywords.length
        || (a.category.priority ?? DEFAULT_PRIORITY) - (b.category.priority ?? DEFAULT_PRIORITY)
        || (a.category.sort_order ?? 0) - (b.category.sort_order ?? 0)
        || (a.category.slug < b.category.slug ? -1 : a.category.slug > b.category.slug ? 1 : 0)
    ));
    return hits.length > 0 ? { category: hits[0].category, keyword: hits[0].keywords[0] } : null;
}

function withKeywordCategory(base: Suggestion, tokens: readonly string[], input: PreClassifyInput): Suggestion {
    if (base.category !== null) return base;
    const best = bestKeywordCategory(tokens, input.categories);
    const deepLinkFired = base.fired.some((name) => name.startsWith('deeplink_'));
    if (!best || (deepLinkFired && best.category.type !== 'complaint')) return base;
    return { ...base, type: best.category.type, category: best.category.slug, keyword: best.keyword, fired: [...base.fired, 'keyword'] };
}

function withCtwaFallback(base: Suggestion, input: PreClassifyInput): Suggestion {
    if (base.type !== null || base.category !== null || !input.is_ctwa || input.customer.known === true) return base;
    const hasRow = input.categories.some((category) => category.slug === CTWA_CATEGORY && isActive(category));
    return { ...base, type: 'sales', category: hasRow ? CTWA_CATEGORY : null, fired: [...base.fired, 'ctwa'] };
}

function hasCutoff(tokens: readonly string[]): boolean {
    return tokens.some((token) => CUTOFF_TOKENS.includes(token))
        || CUTOFF_PHRASES.some((phrase) => containsRun(tokens, phrase));
}

function categoryPriority(slug: string | null, categories: readonly PreClassifyCategory[]): number {
    const row = slug === null ? undefined : categories.find((category) => category.slug === slug && isActive(category));
    if (!row) return DEFAULT_PRIORITY;
    return Math.max(1, Math.min(DEFAULT_PRIORITY, Math.round(row.priority ?? DEFAULT_PRIORITY)));
}

function priorityOf(base: number, cutoff: boolean, ack: boolean): Priority {
    if (ack) return 4;
    return (cutoff ? 1 : base) as Priority;
}

export function preClassify(input: PreClassifyInput): PreClassifyResult {
    const normalised = normaliseForMatch(input.text);
    const tokens = matchTokens(input.text);
    const knownCustomer = input.customer.known === true && input.customer.active_subscriber !== false;
    const queue = knownCustomer ? 'care' : resolveQueueForNumber(input.integrated_number, input.number_queues);
    const fromText = suggestFromText(normalised);
    const activeSlugs = new Set(input.categories.filter(isActive).map((category) => category.slug));
    const validated = fromText.category !== null && !activeSlugs.has(fromText.category)
        ? { ...fromText, category: null }
        : fromText;
    const suggestion = withCtwaFallback(withKeywordCategory(validated, tokens, input), input);
    const cutoff = hasCutoff(tokens);
    const ack = isAckOnly(input.text, input.content_type, input.has_media) && input.is_ctwa !== true;
    return {
        queue,
        suggested_type: suggestion.type,
        suggested_category: suggestion.category,
        order_id_hint: suggestion.orderId,
        matched_keyword: suggestion.keyword,
        priority: priorityOf(categoryPriority(suggestion.category, input.categories), cutoff, ack),
        deadline_hint: cutoff ? 'before_cutoff' : null,
        is_ack_only: ack,
        rules_fired: [
            knownCustomer ? 'queue_known_customer' : 'queue_number',
            ...suggestion.fired,
            ...(cutoff ? ['cutoff_word'] : []),
            ...(ack ? ['ack_only'] : []),
        ],
    };
}

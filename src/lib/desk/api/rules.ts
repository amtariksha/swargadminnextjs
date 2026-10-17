// Pure rule checks of the Desk API: the settings write rules (and, in a later task, the resolve
// rules). No I/O, no clock: the caller passes `now`.

import {
    DUPLICATE_REQUIRED_CODES, HUMAN_RESOLUTION_CODES, LOST_REASON_REQUIRED_CODES, NOTE_REQUIRED_CODES,
    type HumanResolutionCode, type LinkStatus, type LostReason, type ResolutionCode,
} from '../constants';
import type { DeskErrorCode, SettingsPutBody } from '../contracts';
import { DESK_GO_LIVE_REGEX } from '../settings';

const MS_PER_HOUR = 3_600_000;

export interface RuleFailure { ok: false; code: DeskErrorCode; message: string }
export type RuleResult = { ok: true } | RuleFailure;

const OK = { ok: true } as const;
const fail = (code: DeskErrorCode, message: string): RuleFailure => ({ ok: false, code, message });

export interface StoredSettingsText {
    desk_go_live_at: string;
    desk_ui_enabled: string;
}

function checkGoLive(sent: string, stored: StoredSettingsText, now: Date): RuleResult {
    if (stored.desk_go_live_at.trim() !== '') {
        return fail('setting_locked', 'desk_go_live_at is already set. Changing it is an operator action.');
    }
    const sentMs = Date.parse(sent);
    if (!DESK_GO_LIVE_REGEX.test(sent) || !Number.isFinite(sentMs)) {
        return fail('validation_failed', 'desk_go_live_at: not a valid timestamp with an offset');
    }
    if (sentMs < now.getTime() - MS_PER_HOUR) {
        return fail('setting_locked', 'desk_go_live_at may be at most one hour in the past.');
    }
    return OK;
}

function checkStatsFrom(sent: string, body: SettingsPutBody, stored: StoredSettingsText): RuleResult {
    const goLive = body.desk_go_live_at ?? stored.desk_go_live_at;
    const goLiveMs = goLive.trim() === '' ? Number.NaN : Date.parse(goLive);
    if (!Number.isFinite(goLiveMs)) {
        return fail('setting_locked', 'Set desk_go_live_at before desk_stats_from.');
    }
    if (Date.parse(sent) < goLiveMs) {
        return fail('setting_locked', 'desk_stats_from cannot be earlier than desk_go_live_at.');
    }
    return OK;
}

function checkCutover(body: SettingsPutBody, stored: StoredSettingsText): RuleResult {
    const uiOn = body.desk_ui_enabled ?? stored.desk_ui_enabled === '1';
    return uiOn ? OK : fail('setting_locked', 'Turn desk_ui_enabled on before desk_cutover_redirect.');
}

export function checkSettingsPut(body: SettingsPutBody, stored: StoredSettingsText, now: Date): RuleResult {
    if (body.desk_go_live_at !== undefined) {
        const result = checkGoLive(body.desk_go_live_at, stored, now);
        if (!result.ok) return result;
    }
    if (body.desk_stats_from !== undefined) {
        const result = checkStatsFrom(body.desk_stats_from, body, stored);
        if (!result.ok) return result;
    }
    if (body.desk_cutover_redirect === true) return checkCutover(body, stored);
    return OK;
}

export function settingToText(value: unknown): string {
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

// ── Resolve rules (blueprint section 1.3) ──────────────────────────────────

export interface ResolveRuleInput {
    mode: 'resolve' | 'wrap_up';
    ticket: { id: string; link_status: LinkStatus | null };
    category: { default_resolution_code: ResolutionCode | null; requires_delivery_link: boolean } | null;
    body: {
        resolution_code?: HumanResolutionCode;
        resolution_note?: string;
        lost_reason?: LostReason;
        link_status?: 'none_found' | 'not_a_customer';
    };
    /** The ticket found by duplicate_of_ticket_no, or null when none was sent or none exists. */
    duplicateTarget: { id: string } | null;
}

export type ResolveRuleResult =
    | { ok: true; resolution_code: HumanResolutionCode; resolution_note: string | null; lost_reason: LostReason | null }
    | RuleFailure;

const isOneOf = <T extends string>(list: readonly T[], value: string): boolean => list.includes(value as T);

function codeFor(input: ResolveRuleInput): HumanResolutionCode | null {
    if (input.body.resolution_code) return input.body.resolution_code;
    const fallback = input.category?.default_resolution_code ?? null;
    return fallback !== null && isOneOf(HUMAN_RESOLUTION_CODES, fallback) ? (fallback as HumanResolutionCode) : null;
}

function checkResolveOnly(input: ResolveRuleInput, code: HumanResolutionCode): RuleResult {
    if (isOneOf(DUPLICATE_REQUIRED_CODES, code)
        && (input.duplicateTarget === null || input.duplicateTarget.id === input.ticket.id)) {
        return fail('duplicate_target_required', 'Say which ticket this duplicates.');
    }
    const needsLink = input.category?.requires_delivery_link === true;
    if (needsLink && input.ticket.link_status === null && input.body.link_status === undefined) {
        return fail('delivery_link_required', 'Link the delivery, or say there is no matching delivery.');
    }
    return OK;
}

export function checkResolveRules(input: ResolveRuleInput): ResolveRuleResult {
    if (input.category === null) return fail('category_required', 'Choose a category first.');
    const code = codeFor(input);
    if (code === null) return fail('resolution_code_required', 'Choose how this was resolved.');
    const note = input.body.resolution_note?.trim() || null;
    if (isOneOf(NOTE_REQUIRED_CODES, code) && note === null) return fail('note_required', 'Add a note.');
    const lostReason = input.body.lost_reason ?? null;
    if (isOneOf(LOST_REASON_REQUIRED_CODES, code)) {
        if (lostReason === null) return fail('lost_reason_required', 'Say why it was lost.');
        if (lostReason === 'other' && note === null) return fail('note_required', 'Add a note.');
    }
    if (input.mode === 'resolve') {
        const verdict = checkResolveOnly(input, code);
        if (!verdict.ok) return verdict;
    }
    return { ok: true, resolution_code: code, resolution_note: note, lost_reason: isOneOf(LOST_REASON_REQUIRED_CODES, code) ? lostReason : null };
}

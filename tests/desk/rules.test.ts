/**
 * preClassify vectors P01-P46 (with matched_keyword and rules_fired), PX1-PX5, the
 * normalisation vectors NM, the queue vectors QN and the CUTOFF_TOKENS invariants.
 * The category list is a test fixture; the real keywords are data in desk_categories.
 */

import { describe, it, expect } from 'vitest';
import { ACK_CORE, ACK_FILLER } from '@/lib/desk/ack';
import {
    CUTOFF_TOKENS,
    matchTokens,
    normaliseForMatch,
    preClassify,
    resolveQueueForNumber,
    type PreClassifyCategory,
    type PreClassifyInput,
} from '@/lib/desk/rules';

const CARE = '917996196111';
const SALES = '917090166111';
const NUMBER_QUEUES = { '917090166111': 'sales', '917996196111': 'care' };

const category = (
    slug: string, type: string, priority: number, sortOrder: number, active: boolean, keywords: string[],
): PreClassifyCategory => ({ slug, type, priority, sort_order: sortOrder, active, keywords });

const CATEGORIES: PreClassifyCategory[] = [
    category('not_delivered', 'complaint', 2, 10, true, ['not delivered', 'not received', 'didnt get', 'nahi aaya', 'bandilla']),
    category('milk_spoilage', 'complaint', 2, 20, true, ['spoiled', 'spoilt', 'curdled', 'sour', 'kharab']),
    category('health_concern', 'complaint', 1, 30, true, ['vomiting', 'food poisoning', 'stomach pain', 'hospital']),
    category('wrong_product', 'complaint', 3, 40, true, ['wrong product', 'wrong item']),
    category('where_is_my_delivery', 'enquiry', 2, 50, true, ['where is my delivery', 'delivery status']),
    category('add_product_tomorrow', 'request', 2, 60, true, ['extra milk', 'one more packet']),
    category('pause_resume', 'request', 2, 70, true, ['pause', 'resume', 'out of station']),
    category('cancel_subscription', 'request', 2, 80, true, ['cancel subscription', 'stop subscription', 'unsubscribe']),
    category('wallet_help', 'request', 3, 90, true, ['recharge', 'wallet', 'balance']),
    category('new_app_subscription', 'sales', 3, 100, true, ['subscribe', 'new subscription']),
    category('general_enquiry', 'enquiry', 3, 110, true, ['price', 'rate', 'timings']),
    category('legacy_test', 'other', 3, 999, false, ['zzz']),
];

type CustomerKind = 'unknown' | 'known' | 'known_inactive';
const CUSTOMERS: Record<CustomerKind, PreClassifyInput['customer']> = {
    unknown: { known: false, active_subscriber: null },
    known: { known: true, active_subscriber: null },
    known_inactive: { known: true, active_subscriber: false },
};

interface Expected {
    queue: 'care' | 'sales';
    type: string | null;
    category: string | null;
    order: string | null;
    priority: number;
    deadline: 'before_cutoff' | null;
    ack: boolean;
}

type PreVector = [id: string, text: string | null, number: string | null, customer: CustomerKind, ctwa: boolean, expected: Expected];

const x = (
    queue: Expected['queue'], type: string | null, category: string | null, order: string | null,
    priority: number, deadline: Expected['deadline'], ack: boolean,
): Expected => ({ queue, type, category, order, priority, deadline, ack });

const BEFORE = 'before_cutoff';
const DEEP_1 = 'Hi Swarg team, I haven\'t received my order #48213. Please check.';

const PRE_VECTORS: PreVector[] = [
    ['P01', 'Hi', CARE, 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P02', 'Hi', SALES, 'unknown', false, x('sales', null, null, null, 3, null, false)],
    ['P03', 'Hi', SALES, 'known', false, x('care', null, null, null, 3, null, false)],
    ['P04', 'Hi', SALES, 'known_inactive', false, x('sales', null, null, null, 3, null, false)],
    ['P05', 'Hi', '+91 70901 66111', 'unknown', false, x('sales', null, null, null, 3, null, false)],
    ['P06', 'Hi', '7090166111', 'unknown', false, x('sales', null, null, null, 3, null, false)],
    ['P07', 'Hi', 'default', 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P08', 'Hi', null, 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P09', 'Hi', '919999999999', 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P10', 'Hi', '919999999999', 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P11', 'Hi', SALES, 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P12', 'Hi', SALES, 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P13', DEEP_1, CARE, 'unknown', false, x('care', 'complaint', 'not_delivered', '48213', 2, null, false)],
    ['P14', 'Hi Swarg team, I haven’t received my order #48213. Please check.', CARE, 'unknown', false, x('care', 'complaint', 'not_delivered', '48213', 2, null, false)],
    ['P15', 'Hi Swarg team, I haven\'t received my recent delivery. Please check.', CARE, 'unknown', false, x('care', 'complaint', 'not_delivered', null, 2, null, false)],
    ['P16', 'Hi Swarg team, I have a complaint regarding my order #48213. Please check.', CARE, 'unknown', false, x('care', 'complaint', null, '48213', 3, null, false)],
    ['P17', 'Hi Swarg team, I have a complaint. Please check.', CARE, 'unknown', false, x('care', 'complaint', null, null, 3, null, false)],
    ['P18', 'Hi Swarg team, I have a complaint regarding my order #48213. Milk was spoiled', CARE, 'unknown', false, x('care', 'complaint', 'milk_spoilage', '48213', 2, null, false)],
    ['P19', 'milk is spoiled today', CARE, 'unknown', false, x('care', 'complaint', 'milk_spoilage', null, 2, null, false)],
    ['P20', 'My child is vomiting after drinking the milk', CARE, 'unknown', false, x('care', 'complaint', 'health_concern', null, 1, null, false)],
    ['P21', 'price of ghee?', CARE, 'unknown', false, x('care', 'enquiry', 'general_enquiry', null, 3, null, false)],
    ['P22', 'priceless service', CARE, 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P23', 'Please add 1 litre extra milk tomorrow', CARE, 'unknown', false, x('care', 'request', 'add_product_tomorrow', null, 1, BEFORE, false)],
    ['P24', 'kal se doodh band karo', CARE, 'unknown', false, x('care', null, null, null, 1, BEFORE, false)],
    ['P25', 'naale haalu beda', CARE, 'unknown', false, x('care', null, null, null, 1, BEFORE, false)],
    ['P26', 'stop', CARE, 'unknown', false, x('care', null, null, null, 1, BEFORE, false)],
    ['P27', 'pause my subscription from Monday', CARE, 'unknown', false, x('care', 'request', 'pause_resume', null, 1, BEFORE, false)],
    ['P28', 'cancel subscription', CARE, 'unknown', false, x('care', 'request', 'cancel_subscription', null, 1, BEFORE, false)],
    ['P29', 'my address is wrong', CARE, 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P30', 'don\'t deliver on Sunday', CARE, 'unknown', false, x('care', null, null, null, 1, BEFORE, false)],
    ['P31', 'I am interested', SALES, 'unknown', true, x('sales', 'sales', 'new_app_subscription', null, 3, null, false)],
    ['P32', 'I am interested', CARE, 'unknown', true, x('care', 'sales', 'new_app_subscription', null, 3, null, false)],
    ['P33', 'I am interested', SALES, 'known', true, x('care', null, null, null, 3, null, false)],
    ['P34', 'what is the price', SALES, 'unknown', true, x('sales', 'enquiry', 'general_enquiry', null, 3, null, false)],
    ['P35', 'ok', SALES, 'unknown', true, x('sales', 'sales', 'new_app_subscription', null, 3, null, false)],
    ['P36', 'ok', CARE, 'unknown', false, x('care', null, null, null, 4, null, true)],
    ['P37', 'Thanks \u{1F64F}', CARE, 'unknown', false, x('care', null, null, null, 4, null, true)],
    ['P38', '', CARE, 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P39', 'order #5512 not delivered', CARE, 'unknown', false, x('care', 'complaint', 'not_delivered', '5512', 2, null, false)],
    ['P40', 'Order # 77 wrong item', CARE, 'unknown', false, x('care', 'complaint', 'wrong_product', '77', 3, null, false)],
    ['P41', 'wallet recharge not received', CARE, 'unknown', false, x('care', 'request', 'wallet_help', null, 3, null, false)],
    ['P42', 'spoiled and wrong item', CARE, 'unknown', false, x('care', 'complaint', 'milk_spoilage', null, 2, null, false)],
    ['P43', 'NOT DELIVERED!!!', CARE, 'unknown', false, x('care', 'complaint', 'not_delivered', null, 2, null, false)],
    ['P44', 'zzz', CARE, 'unknown', false, x('care', null, null, null, 3, null, false)],
    ['P45', DEEP_1, CARE, 'unknown', false, x('care', 'complaint', null, '48213', 3, null, false)],
    ['P46', null, CARE, 'unknown', false, x('care', null, null, null, 3, null, false)],
];

const MATCHED_KEYWORDS: Record<string, string> = {
    P18: 'spoiled', P19: 'spoiled', P20: 'vomiting', P21: 'price', P23: 'extra milk', P27: 'pause',
    P28: 'cancel subscription', P34: 'price', P39: 'not delivered', P40: 'wrong item', P41: 'recharge',
    P42: 'spoiled', P43: 'not delivered',
};

const FIRED_GROUPS: Array<[fired: string[], ids: string[]]> = [
    [['queue_known_customer'], ['P03', 'P33']],
    [['queue_number'], ['P01', 'P02', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P22', 'P29', 'P38', 'P44', 'P46']],
    [['queue_number', 'deeplink_not_received_order'], ['P13', 'P14', 'P45']],
    [['queue_number', 'deeplink_not_received_recent'], ['P15']],
    [['queue_number', 'deeplink_complaint_order'], ['P16']],
    [['queue_number', 'deeplink_complaint'], ['P17']],
    [['queue_number', 'deeplink_complaint_order', 'keyword'], ['P18']],
    [['queue_number', 'keyword'], ['P19', 'P20', 'P21', 'P34', 'P41', 'P42', 'P43']],
    [['queue_number', 'keyword', 'cutoff_word'], ['P23', 'P27', 'P28']],
    [['queue_number', 'cutoff_word'], ['P24', 'P25', 'P26', 'P30']],
    [['queue_number', 'ctwa'], ['P31', 'P32', 'P35']],
    [['queue_number', 'ack_only'], ['P36', 'P37']],
    [['queue_number', 'order_hash', 'keyword'], ['P39', 'P40']],
];

const FIRED_BY_ID = new Map<string, string[]>(FIRED_GROUPS.flatMap(([fired, ids]) => ids.map((id): [string, string[]] => [id, fired])));

function inputFor(id: string, text: string | null, number: string | null, customer: CustomerKind, ctwa: boolean): PreClassifyInput {
    const overrides: Record<string, Partial<PreClassifyInput>> = {
        P10: { number_queues: { '917090166111': 'sales', default: 'sales' } },
        P11: { number_queues: null },
        P12: { number_queues: { '917090166111': 'vip' } },
        P38: { content_type: 'image', has_media: true },
        P45: { categories: [] },
        P46: { content_type: 'audio', has_media: true },
    };
    return {
        text,
        content_type: 'text',
        has_media: false,
        integrated_number: number,
        number_queues: NUMBER_QUEUES,
        customer: CUSTOMERS[customer],
        is_ctwa: ctwa,
        categories: CATEGORIES,
        ...overrides[id],
    };
}

describe('preClassify', () => {
    it.each(PRE_VECTORS)('%s', (id, text, number, customer, ctwa, expected) => {
        const result = preClassify(inputFor(id, text, number, customer, ctwa));
        expect(result).toEqual({
            queue: expected.queue,
            suggested_type: expected.type,
            suggested_category: expected.category,
            order_id_hint: expected.order,
            matched_keyword: MATCHED_KEYWORDS[id] ?? null,
            priority: expected.priority,
            deadline_hint: expected.deadline,
            is_ack_only: expected.ack,
            rules_fired: FIRED_BY_ID.get(id),
        });
    });

    it('carries every vector of the spec', () => {
        expect(PRE_VECTORS).toHaveLength(46);
        expect(FIRED_BY_ID.size).toBe(46);
    });

    it('does not mutate its input', () => {
        const input = inputFor('P23', PRE_VECTORS[22][1], CARE, 'unknown', false);
        const snapshot = JSON.stringify(input);
        preClassify(input);
        expect(JSON.stringify(input)).toBe(snapshot);
    });
});

describe('preClassify, added vectors (PX)', () => {
    type PxVector = [id: string, text: string, type: string | null, category: string | null, order: string | null, keyword: string | null, priority: number, fired: string[]];
    const PX_VECTORS: PxVector[] = [
        ['PX1', 'Hi Swarg team, I have a complaint. what is the price', 'complaint', null, null, null, 3, ['queue_number', 'deeplink_complaint']],
        ['PX2', 'order #12 price?', 'enquiry', 'general_enquiry', '12', 'price', 3, ['queue_number', 'order_hash', 'keyword']],
        ['PX3', 'Hi Swarg team, I have a complaint regarding my order #9. wallet recharge', 'complaint', null, '9', null, 3, ['queue_number', 'deeplink_complaint_order']],
        ['PX4', 'i havent received my order #5', 'complaint', 'not_delivered', '5', null, 2, ['queue_number', 'deeplink_not_received_order']],
        ['PX5', 'ORDER#5', null, null, '5', null, 3, ['queue_number', 'order_hash']],
    ];

    it.each(PX_VECTORS)('%s', (id, text, type, categorySlug, order, keyword, priority, fired) => {
        expect(preClassify(inputFor(id, text, CARE, 'unknown', false))).toEqual({
            queue: 'care',
            suggested_type: type,
            suggested_category: categorySlug,
            order_id_hint: order,
            matched_keyword: keyword,
            priority,
            deadline_hint: null,
            is_ack_only: false,
            rules_fired: fired,
        });
    });

    it('carries every vector', () => {
        expect(PX_VECTORS).toHaveLength(5);
    });

    it('still reads an order number typed after a deep link that has none', () => {
        const result = preClassify(inputFor('X', 'I have a complaint. order #31', CARE, 'unknown', false));
        expect(result.order_id_hint).toBe('31');
        expect(result.rules_fired).toEqual(['queue_number', 'deeplink_complaint', 'order_hash']);
    });
});

describe('normaliseForMatch and matchTokens (NM)', () => {
    it('NM1 folds case, whitespace and apostrophes', () => {
        expect(normaliseForMatch('  Hi   Swarg\nTEAM, I haven’t  ')).toBe('hi swarg team, i haven\'t');
    });
    it('NM2 folds full-width letters', () => {
        expect(normaliseForMatch('Ｈｉ')).toBe('hi');
    });
    it('NM3 turns null into an empty string', () => {
        expect(normaliseForMatch(null)).toBe('');
    });
    it('NM4 deletes apostrophes and drops punctuation', () => {
        expect(matchTokens('Don\'t deliver on Sunday!!')).toEqual(['dont', 'deliver', 'on', 'sunday']);
    });
    it('NM5 keeps digits and drops dashes', () => {
        expect(matchTokens('Order # 77 — wrong item')).toEqual(['order', '77', 'wrong', 'item']);
    });
    it('NM6 splits on the underscore and keeps digits', () => {
        expect(matchTokens('milk_spoilage 2L')).toEqual(['milk', 'spoilage', '2l']);
    });
    it('NM7 returns no tokens for blanks', () => {
        expect(matchTokens('   ')).toEqual([]);
    });
    it('NM8 returns no tokens for null', () => {
        expect(matchTokens(null)).toEqual([]);
    });
});

describe('resolveQueueForNumber (QN)', () => {
    it('QN1 reduces map keys to digits', () => {
        expect(resolveQueueForNumber(SALES, { '+91 70901 66111': 'sales' })).toBe('sales');
    });
    it('QN2 does not tail-match fewer than 10 digits', () => {
        expect(resolveQueueForNumber('66111', { '917090166111': 'sales' })).toBe('care');
    });
    it('QN3 maps everything to care on an empty map', () => {
        expect(resolveQueueForNumber(SALES, {})).toBe('care');
    });
});

describe('CUTOFF_TOKENS', () => {
    it('has 11 members', () => {
        expect(CUTOFF_TOKENS).toHaveLength(11);
    });

    it('shares no member with the ack core or filler lists', () => {
        const ackWords = new Set([...ACK_CORE, ...ACK_FILLER]);
        expect(CUTOFF_TOKENS.filter((token) => ackWords.has(token))).toEqual([]);
    });
});

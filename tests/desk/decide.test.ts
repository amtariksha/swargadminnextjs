/**
 * Decision table D01-D29, the isQuestionText vectors and the edge inputs DX1-DX6.
 * decideInbound answers one question: does this customer message join, reopen or
 * start a ticket. Fixtures use explicit offsets only.
 */

import { describe, it, expect } from 'vitest';
import {
    decideInbound,
    isQuestionText,
    type InboundDecision,
    type InboundMessage,
    type InboundSettings,
    type InboundState,
} from '@/lib/desk/decide';

const MESSAGE_AT = '2026-10-12T12:00:00.000+05:30';
const THIRTY_MIN_AGO = '2026-10-12T11:30:00.000+05:30';

interface Row {
    id: string;
    unresolved?: string | null;
    resolved?: {
        at?: string;
        via?: string | null;
        humanAfter?: boolean;
        questionBefore?: boolean;
    } | null;
    ack?: boolean;
    mode: string;
    window?: number;
    expected: [action: InboundDecision['action'], reason: InboundDecision['reason'], previous: string | null];
}

function buildState(row: Row): InboundState {
    const resolved = row.resolved === undefined ? {} : row.resolved;
    return {
        unresolved: row.unresolved
            ? { id: 'T1', status: row.unresolved, last_inbound_at: null }
            : null,
        latest_resolved: resolved === null
            ? null
            : {
                id: 'T0',
                resolved_at: resolved.at ?? THIRTY_MIN_AGO,
                resolved_via: resolved.via === undefined ? 'manual' : resolved.via,
                human_message_after_resolution: resolved.humanAfter ?? false,
                last_human_message_before_resolution_is_question: resolved.questionBefore ?? false,
            },
    };
}

function buildMessage(row: Row): InboundMessage {
    return { id: 'm1', created_at: MESSAGE_AT, is_ack: row.ack ?? false };
}

function buildSettings(row: Row): InboundSettings {
    return { reopen_window_hours: row.window ?? 2, ack_suppress: row.mode };
}

const ROWS: Row[] = [
    { id: 'D01', unresolved: 'new', resolved: null, mode: 'shadow', expected: ['append', 'unresolved_exists', null] },
    { id: 'D02', unresolved: 'on_hold', resolved: null, ack: true, mode: 'on', expected: ['append', 'unresolved_exists', null] },
    { id: 'D03', unresolved: 'open', mode: 'on', expected: ['append', 'unresolved_exists', null] },
    { id: 'D04', resolved: null, mode: 'shadow', expected: ['create', 'no_ticket', null] },
    { id: 'D05', resolved: null, ack: true, mode: 'on', expected: ['create', 'no_ticket', null] },
    { id: 'D06', mode: 'shadow', expected: ['reopen', 'inside_window', null] },
    { id: 'D07', resolved: { at: '2026-10-12T10:00:00.000+05:30' }, mode: 'shadow', expected: ['reopen', 'inside_window', null] },
    { id: 'D08', resolved: { at: '2026-10-12T09:59:58.800+05:30' }, mode: 'shadow', expected: ['create', 'outside_window', 'T0'] },
    { id: 'D09', resolved: { at: '2026-10-09T12:00:00.000+05:30' }, ack: true, mode: 'on', expected: ['create', 'outside_window', 'T0'] },
    { id: 'D10', ack: true, mode: 'off', expected: ['reopen', 'ack_mode_off', null] },
    { id: 'D11', ack: true, mode: 'shadow', expected: ['reopen', 'ack_shadow', null] },
    { id: 'D12', ack: true, mode: 'on', expected: ['ack_attach', 'ack_suppressed', null] },
    { id: 'D13', resolved: { via: 'action' }, ack: true, mode: 'on', expected: ['ack_attach', 'ack_suppressed', null] },
    { id: 'D14', resolved: { via: 'auto_idle' }, ack: true, mode: 'on', expected: ['reopen', 'ack_system_resolution', null] },
    { id: 'D15', resolved: { via: 'legacy_inbox' }, ack: true, mode: 'on', expected: ['reopen', 'ack_system_resolution', null] },
    { id: 'D16', resolved: { via: 'system' }, ack: true, mode: 'on', expected: ['reopen', 'ack_system_resolution', null] },
    { id: 'D17', resolved: { via: 'migration' }, ack: true, mode: 'on', expected: ['reopen', 'ack_system_resolution', null] },
    { id: 'D18', resolved: { via: 'auto_converted' }, ack: true, mode: 'on', expected: ['reopen', 'ack_system_resolution', null] },
    { id: 'D19', resolved: { humanAfter: true }, ack: true, mode: 'on', expected: ['reopen', 'ack_after_human_message', null] },
    { id: 'D20', resolved: { questionBefore: true }, ack: true, mode: 'on', expected: ['reopen', 'ack_answers_question', null] },
    { id: 'D21', resolved: { via: 'auto_idle' }, ack: true, mode: 'shadow', expected: ['reopen', 'ack_system_resolution', null] },
    { id: 'D22', resolved: { questionBefore: true }, ack: true, mode: 'shadow', expected: ['reopen', 'ack_answers_question', null] },
    { id: 'D23', resolved: { humanAfter: true }, ack: true, mode: 'shadow', expected: ['reopen', 'ack_after_human_message', null] },
    { id: 'D24', mode: 'on', expected: ['reopen', 'inside_window', null] },
    { id: 'D25', ack: true, mode: 'yes', expected: ['reopen', 'ack_shadow', null] },
    { id: 'D26', window: 0, mode: 'on', expected: ['create', 'outside_window', 'T0'] },
    { id: 'D27', resolved: { at: '2026-10-12T12:05:00.000+05:30' }, mode: 'on', expected: ['reopen', 'inside_window', null] },
    { id: 'D28', resolved: { at: 'not-a-date' }, mode: 'on', expected: ['create', 'outside_window', 'T0'] },
    { id: 'D29', ack: true, window: 0.25, mode: 'on', expected: ['create', 'outside_window', 'T0'] },
];

function decisionOf(action: InboundDecision['action'], reason: InboundDecision['reason'], previous: string | null): InboundDecision {
    return { action, reason, previous_ticket_id: previous };
}

describe('decideInbound', () => {
    it.each(ROWS)('$id', (row) => {
        const decision = decideInbound(buildState(row), buildMessage(row), buildSettings(row));
        expect(decision).toEqual(decisionOf(...row.expected));
    });

    it('carries every vector of the spec', () => {
        expect(ROWS).toHaveLength(29);
    });

    it('never mutates its inputs', () => {
        const row = ROWS[11];
        const state = Object.freeze(buildState(row));
        const message = Object.freeze(buildMessage(row));
        const settings = Object.freeze(buildSettings(row));
        expect(() => decideInbound(state, message, settings)).not.toThrow();
    });
});

describe('decideInbound edge inputs (DX)', () => {
    const d12 = ROWS[11];
    const baseState = buildState(d12);
    const baseMessage = buildMessage(d12);
    const baseSettings = buildSettings(d12);
    const outside = decisionOf('create', 'outside_window', 'T0');

    it('starts from the D12 result', () => {
        expect(decideInbound(baseState, baseMessage, baseSettings)).toEqual(decisionOf('ack_attach', 'ack_suppressed', null));
    });

    it.each([
        ['DX1', { ...baseSettings, reopen_window_hours: Number.NaN }],
        ['DX2', { ...baseSettings, reopen_window_hours: -1 }],
        ['DX3', { ...baseSettings, reopen_window_hours: Number.POSITIVE_INFINITY }],
    ])('%s treats an unusable window as outside', (_id, settings) => {
        expect(decideInbound(baseState, baseMessage, settings)).toEqual(outside);
    });

    it('DX4 treats an unparseable message time as outside', () => {
        const message = { ...baseMessage, created_at: 'garbage' };
        expect(decideInbound(baseState, message, baseSettings)).toEqual(outside);
    });

    it('DX5 treats a null resolved_via as a system resolution', () => {
        const state: InboundState = {
            ...baseState,
            latest_resolved: baseState.latest_resolved && { ...baseState.latest_resolved, resolved_via: null },
        };
        expect(decideInbound(state, baseMessage, baseSettings)).toEqual(decisionOf('reopen', 'ack_system_resolution', null));
    });

    it('DX6 treats a missing mode as shadow', () => {
        const settings = { ...baseSettings, ack_suppress: undefined } as unknown as InboundSettings;
        expect(decideInbound(baseState, baseMessage, settings)).toEqual(decisionOf('reopen', 'ack_shadow', null));
    });
});

describe('isQuestionText', () => {
    const VECTORS: Array<[text: string | null, expected: boolean]> = [
        ['Shall I add 1L for tomorrow?', true],
        ['Refund done', false],
        ['ठीक है？', true],
        [null, false],
    ];

    it.each(VECTORS)('%s', (text, expected) => {
        expect(isQuestionText(text)).toBe(expected);
    });

    it('recognises the Arabic and Spanish question marks and ignores undefined', () => {
        expect(isQuestionText('هل وصل؟')).toBe(true);
        expect(isQuestionText('¿Cuánto')).toBe(true);
        expect(isQuestionText(undefined)).toBe(false);
    });

    it('tests "contains", not "ends with"', () => {
        expect(isQuestionText('Shall I add 1L? Let me know')).toBe(true);
    });
});

// Inbound decision: given the state of a conversation's tickets and one new customer message,
// does the message join the open ticket, reopen the last resolved one, sit on it silently (an
// ack inside the window), or start a new ticket. Pure; the caller supplies the facts (including
// whether the message is an ack) and the settings, and performs the write.

import { HUMAN_RESOLVED_VIA } from './constants';

export type InboundAction = 'append' | 'reopen' | 'ack_attach' | 'create';

export type InboundReason =
    | 'unresolved_exists' | 'no_ticket' | 'outside_window' | 'inside_window'
    | 'ack_mode_off' | 'ack_system_resolution' | 'ack_after_human_message'
    | 'ack_answers_question' | 'ack_shadow' | 'ack_suppressed';

export interface InboundState {
    /** The conversation's unresolved ticket (status <> 'resolved'), if any. */
    unresolved: { id: string; status: string; last_inbound_at: string | null } | null;
    /** The conversation's most recently resolved ticket (highest resolved_at), if any. */
    latest_resolved: {
        id: string;
        resolved_at: string;
        resolved_via: string | null;
        /** A row with isHumanReply === true and created_at > resolved_at exists. */
        human_message_after_resolution: boolean;
        /** The last row with isHumanReply === true and created_at <= resolved_at passes isQuestionText. */
        last_human_message_before_resolution_is_question: boolean;
    } | null;
}

export interface InboundMessage { id: string; created_at: string; is_ack: boolean }
/** A DeskSettings object satisfies this. `ack_suppress` is typed string so that a bad value can be tested. */
export interface InboundSettings { reopen_window_hours: number; ack_suppress: string }

export interface InboundDecision {
    action: InboundAction;
    reason: InboundReason;
    /** Set only for action 'create' after a resolved ticket: the id to store in previous_ticket_id. */
    previous_ticket_id: string | null;
}

type ResolvedTicket = NonNullable<InboundState['latest_resolved']>;

const QUESTION_MARKS = /[?？؟¿]/;
const MS_PER_HOUR = 3_600_000;

export function isQuestionText(body: string | null | undefined): boolean {
    return typeof body === 'string' && QUESTION_MARKS.test(body.normalize('NFKC'));
}

function decision(action: InboundAction, reason: InboundReason, previous: string | null = null): InboundDecision {
    return { action, reason, previous_ticket_id: previous };
}

function isInsideWindow(messageAt: string, resolvedAt: string, windowHours: number): boolean {
    if (typeof windowHours !== 'number' || !Number.isFinite(windowHours) || windowHours <= 0) return false;
    const elapsed = Date.parse(messageAt) - Date.parse(resolvedAt);
    return Number.isFinite(elapsed) && elapsed <= windowHours * MS_PER_HOUR;
}

function ackMode(value: string): 'off' | 'shadow' | 'on' {
    return value === 'on' || value === 'off' ? value : 'shadow';
}

/** Rules 5-10: the message is an ack inside the reopen window. */
function decideAck(resolved: ResolvedTicket, mode: 'off' | 'shadow' | 'on'): InboundDecision {
    if (mode === 'off') return decision('reopen', 'ack_mode_off');
    const humanResolution = (HUMAN_RESOLVED_VIA as readonly string[]).includes(resolved.resolved_via ?? '');
    if (!humanResolution) return decision('reopen', 'ack_system_resolution');
    if (resolved.human_message_after_resolution) return decision('reopen', 'ack_after_human_message');
    if (resolved.last_human_message_before_resolution_is_question) return decision('reopen', 'ack_answers_question');
    return mode === 'on' ? decision('ack_attach', 'ack_suppressed') : decision('reopen', 'ack_shadow');
}

export function decideInbound(state: InboundState, message: InboundMessage, settings: InboundSettings): InboundDecision {
    if (state.unresolved) return decision('append', 'unresolved_exists');
    const resolved = state.latest_resolved;
    if (!resolved) return decision('create', 'no_ticket');
    if (!isInsideWindow(message.created_at, resolved.resolved_at, settings.reopen_window_hours)) {
        return decision('create', 'outside_window', resolved.id);
    }
    if (!message.is_ack) return decision('reopen', 'inside_window');
    return decideAck(resolved, ackMode(settings.ack_suppress));
}

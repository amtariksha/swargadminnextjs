// Types only: what the customer pane hands to every action slot (units P4a, P4b, P4c).
// No runtime code, so a server file may import it too.

import type { ActionPostOutcome } from './action-client';
import type {
    Category, CustomerSnapshot, DeskMe, SnapshotDayOrder, SnapshotDelivery, SnapshotSubscription,
    TicketDetail, TicketView,
} from './types';

/** Where in the pane a slot is rendered. Each owner renders only the buttons of its placements. */
export type DeskActionPlacement =
    | { at: 'bar' }
    | { at: 'match' }
    | { at: 'delivery'; delivery: SnapshotDelivery }
    | { at: 'day_order'; dayOrder: SnapshotDayOrder }
    | { at: 'subscription'; subscription: SnapshotSubscription };

export interface DeskActionContext {
    ticket: TicketView;
    detail: TicketDetail;
    category: Category | null;
    /** Slots are not rendered before it loads. Write phones into app_db only as snapshot.canonical_phone. */
    snapshot: CustomerSnapshot;
    /** Byte-exact seen-token (contract §5). A drawer copies it when it opens and sends that copy. */
    seenInboundAt: string | null;
    /** money, manager, credit_max_agent. */
    me: DeskMe;
    /** Call once with the result of useTicketAction: the pane toasts, refetches, and handles a conflict. */
    onRecorded: (outcome: ActionPostOutcome) => void;
}

export interface DeskActionSlotProps { ctx: DeskActionContext; placement: DeskActionPlacement }

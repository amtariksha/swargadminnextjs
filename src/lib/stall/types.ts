/**
 * Stall POS — shared types.
 *
 * Mirrors the backend response shapes exactly (swargnodejsbackend
 * src/controllers/stall*Controller.js). Field names are the wire contract.
 */

export interface StallSummary {
    id: number;
    code: string;
    title: string;
    location_text: string | null;
    is_active: boolean;
    self_order_enabled: boolean;
    void_after_minutes: number;
    open_from: string | null;
    open_to: string | null;
    has_passcode: boolean;
    passcode_set_at: string | null;
    created_at: string | null;
    menu_count?: number;
}

export interface StallMenuItem {
    id: number;
    product_id: number;
    variant_id: number | null;
    label: string;
    size_text: string | null;
    price: number;
    tab: string | null;
    sort_order: number;
    is_active: boolean;
    product_title: string | null;
    variant_qty_text: string | null;
    image_url: string | null;
    /** The tile points at a morning-only product — sellable, but flagged. */
    warn_morning_only: boolean;
    /** The tile points at an archived variant. */
    warn_variant_archived: boolean;
}

/** One line in the till's cart. Price is display-only — the server re-prices. */
export interface CartLine {
    menuItemId: number;
    label: string;
    sizeText: string | null;
    unitPrice: number;
    qty: number;
}

export type StallState = 'new' | 'preparing' | 'ready' | 'handed_over';

export interface QueueTicket {
    id: number;
    order_no: number | null;
    token: number | null;
    state: StallState;
    payment_status: string;
    payment_mode: string | null;
    total_amount: number;
    contact_phone: string | null;
    note: string | null;
    created_at: string | null;
    items: { label: string; qty: number }[];
}

export interface StallQueue {
    stall: { id: number; code: string; title: string };
    date: string;
    orders: QueueTicket[];
    /** True when this caller may see the day's takings — false for stall-queue. */
    can_see_totals?: boolean;
    /** NULL for a queue-only caller: the takings are not their business. */
    totals: null | {
        orders_count: number;
        paid_total: number;
        unpaid_total: number;
        cash_total: number;
        upi_total: number;
        link_total: number;
        /** Orders that exist but have not settled — deliberately NOT on the board. */
        awaiting_payment: number;
    };
}

export interface StallOrderResult {
    id: number;
    order_no: number | null;
    token: number | null;
    total: number;
    reused: boolean;
}

/** Settled states, mirroring the backend's PAID_STATES. */
export const PAID_STATES = ['paid', 'cash', 'wallet_deducted'];
export const isSettled = (s: string | null | undefined) => PAID_STATES.includes(String(s));

export const cartSubtotal = (lines: CartLine[]) =>
    Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0) * 100) / 100;

/**
 * One row of the day's till roll.
 *
 * A superset of QueueTicket: the board hides handed-over, unpaid and swept
 * orders on purpose, and this is the screen that has to show all three.
 */
export interface StallSale {
    id: number;
    order_no: number | null;
    token: number | null;
    state: StallState;
    order_status: string;
    cancelled: boolean;
    cancellation_reason: string | null;
    payment_status: string;
    payment_mode: string | null;
    payment_short_url: string | null;
    total_amount: number;
    contact_phone: string | null;
    note: string | null;
    created_at: string | null;
    paid_at: string | null;
    items: { label: string; qty: number; line_total: number | null }[];
}

export interface StallSalesDay {
    stall: { id: number; code: string; title: string };
    date: string;
    orders: StallSale[];
    totals: NonNullable<StallQueue['totals']>;
}

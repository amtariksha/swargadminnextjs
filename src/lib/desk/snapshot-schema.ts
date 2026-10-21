// Parser of the backend customer snapshot (contract b §6.2). Pure and server-safe: the browser hook
// (snapshot-client.ts) and the P4a server call (snapshot-server.ts) both parse through this file, so
// a field the backend renames fails loudly in one place instead of rendering as "undefined".

import { z } from 'zod';
import { DAYTIME_PAYMENT_STATUSES } from './constants';
import { backendEnvelope } from './contracts';
import type { CustomerSnapshot } from './types';

/** PostgreSQL NUMERIC and BIGINT can arrive as strings through node-postgres; accept digits only. */
const int = z.union([z.number().int(), z.string().regex(/^-?\d+$/).transform(Number)]);
const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);
const text = z.string();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const naive = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
const status123 = int.pipe(z.union([z.literal(1), z.literal(2), z.literal(3)]));
const reason1234 = int.pipe(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]));

const candidate = z.object({
    user_id: int,
    name: text.nullable(),
    phone_tail: text,
    matched_on: z.enum(['phone', 'alternate_phone', 'address_phone']),
    apartment_name: text.nullable(),
    flat_no: text.nullable(),
    area: text.nullable(),
    is_staff: z.boolean(),
});

const subscription = z.object({
    order_id: int,
    product_id: int,
    product_title: text,
    qty_text: text.nullable(),
    variant_id: int.nullable(),
    qty: num,
    subscription_type: reason1234,
    selected_days_for_weekly: text.nullable(),
    order_type: int.nullable(),
    order_amount: num,
    start_date: date.nullable(),
    end_date: date.nullable(),
    address_id: int.nullable(),
    state: z.enum(['active', 'upcoming']),
    created_at: naive.nullable(),
});

const delivery = z.object({
    delivery_id: int,
    order_id: int,
    delivery_date: date,
    status: status123,
    qty: num,
    product_id: int,
    product_title: text,
    qty_text: text.nullable(),
    driver_user_id: int.nullable(),
    driver_name: text.nullable(),
    tap_time: naive.nullable(),
    usual_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    late_by_min: num.nullable(),
    tap_distance_m: num.nullable(),
    marked_by: z.enum(['driver', 'admin']).nullable(),
    reason_category: reason1234.nullable(),
    reason: text.nullable(),
    debit_txn_id: int.nullable(),
    debit_amount: num.nullable(),
    refunded: z.boolean(),
    refund_txn_id: int.nullable(),
    refund_amount: num.nullable(),
});

const dayOrder = z.object({
    id: int,
    order_no: int,
    delivery_date: date,
    total_amount: num,
    order_status: z.enum(['pending', 'confirmed', 'delivered', 'cancelled']),
    payment_status: z.enum(DAYTIME_PAYMENT_STATUSES),
    payment_mode: text.nullable(),
    payment_short_url: text.nullable(),
    entry_type: text.nullable(),
    items_text: text,
    delivery_status: z.enum(['pending', 'claimed', 'delivered']).nullable(),
    delivered_at: naive.nullable(),
    created_at: naive,
});

const recentAction = z.object({
    kind: z.enum(['refund', 'wallet_credit', 'app_order', 'day_order', 'holiday']),
    ref_type: z.enum(['transaction', 'order', 'daytime_order', 'holiday']),
    ref_id: z.string().min(1),
    amount: num.nullable(),
    at: naive,
    summary: text,
});

export const customerSnapshotSchema: z.ZodType<CustomerSnapshot> = z.object({
    canonical_phone: z.string().regex(/^[0-9]{8,15}$/),
    phone_variants: z.array(text),
    match: z.object({
        kind: z.enum(['exact', 'alternate', 'candidates', 'staff', 'none']),
        user_id: int.nullable(),
        candidates: z.array(candidate),
    }),
    profile: z.object({
        user_id: int,
        name: text.nullable(),
        phone: text.nullable(),
        email: text.nullable(),
        channel_tag: text.nullable(),
        is_b2b: z.boolean(),
        alternate_phones: z.array(text),
        created_at: naive.nullable(),
    }).nullable(),
    wallet: z.object({ balance: num, low_balance: z.boolean(), low_balance_threshold: num.nullable() }).nullable(),
    address: z.object({
        address_id: int,
        name: text.nullable(),
        s_phone: text.nullable(),
        flat_no: text.nullable(),
        apartment_name: text.nullable(),
        area: text.nullable(),
        landmark: text.nullable(),
        city: text.nullable(),
        pincode: text.nullable(),
        lat: num.nullable(),
        lng: num.nullable(),
    }).nullable(),
    driver: z.object({ user_id: int, name: text.nullable(), phone: text.nullable() }).nullable(),
    drop_point: z.object({ id: int, title: text }).nullable(),
    subscriptions: z.array(subscription),
    holidays: z.array(z.object({ id: int, date })),
    last_order: z.object({
        channel: z.enum(['app', 'day']),
        id: int,
        created_at: naive,
        title: text,
        amount: num.nullable(),
    }).nullable(),
    recent_deliveries: z.array(delivery),
    recent_day_orders: z.array(dayOrder),
    recent_actions: z.array(recentAction),
    tomorrow: z.object({
        date,
        list_generated: z.boolean(),
        cutoff: z.string().regex(/^\d{2}:\d{2}$/),
        cutoff_passed: z.boolean(),
        rows: z.array(z.object({ delivery_id: int, order_id: int, product_title: text, qty: num, status: status123 })),
    }),
    generated_at: naive,
});

const snapshotEnvelope = backendEnvelope(customerSnapshotSchema);

/** The snapshot from a backend body, or null when the body is not a successful snapshot envelope. */
export function parseSnapshotEnvelope(body: unknown): CustomerSnapshot | null {
    const parsed = snapshotEnvelope.safeParse(body);
    if (!parsed.success || parsed.data.response !== 200 || parsed.data.status === false) return null;
    return parsed.data.data;
}

/** The first field the parser rejected, as a dotted path ('data.recent_deliveries.3.status'); null when it parses. */
export function snapshotParseIssue(body: unknown): string | null {
    const parsed = snapshotEnvelope.safeParse(body);
    if (parsed.success) return null;
    const issue = parsed.error.issues[0];
    return issue === undefined || issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.');
}

export interface SnapshotFailure { code: string; message: string }

const BODY_CODE = /^[a-z][a-z0-9_]{1,59}$/;

function bodyField(body: unknown, key: 'code' | 'message'): unknown {
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;
}

/** A failed snapshot call as a stable code and a message (backend error envelope, docs/error-envelope.md). */
export function describeSnapshotFailure(status: number, body: unknown): SnapshotFailure {
    const rawMessage = bodyField(body, 'message');
    const first = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;
    const message = typeof first === 'string' && first.trim() !== '' ? first : `HTTP ${status}`;
    if (status === 0) return { code: 'network', message: 'Network error' };
    if (status === 401) return { code: 'unauthorized', message };
    if (status === 403) return { code: 'forbidden', message };
    if (status === 404) return { code: 'not_deployed', message };
    if (status === 429) return { code: 'rate_limited', message };
    if (status >= 500) return { code: 'backend_error', message };
    const code = bodyField(body, 'code');
    return { code: typeof code === 'string' && BODY_CODE.test(code) ? code : `http_${status}`, message };
}

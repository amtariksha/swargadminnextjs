/**
 * Shop Deliveries page — the day's B2B shop stops with their bills and Tally sync.
 * Shapes mirror swargnodejsbackend GET /get_shop_delivery_list/:date
 * (dropPointController.getShopDeliveryList + utils/shopBillingStatus.js).
 */

export type TallyStatus = 'pending' | 'confirmed' | 'failed' | 'skipped' | 'merged';

export interface ShopInvoice {
    id: number;
    invoice_number: string;
    total_amount: number;
    cancelled: boolean;
    tally: { status: TallyStatus | null; error: string | null; next_attempt_at: string | null };
}

export interface ShopLine {
    pre_delivery_id: number;
    order_id: number;
    product_title: string;
    qty_text: string | null;
    delivered_qty: number;
    reason: string | null;
    status: number; // 1 pending | 2 not delivered | 3 delivered
    invoice: ShopInvoice | null; // per-delivery shops only
}

export interface ShopStop {
    b2b_user_id: number;
    drop_point_id: number | null;
    title: string;
    customer_name: string;
    customer_phone: string | null;
    route_order: number | null;
    truck_driver_name: string | null;
    moved_to_day: boolean; // handed to a day driver (live b2b_shop day order)
    status: number; // 1 = pending, 3 = all lines resolved
    products: ShopLine[];
    billing_cycle: number; // 0 one bill per day, 1 monthly, 2 weekly (statement week)
    invoices: ShopInvoice[]; // every invoice behind this shop's day
    unbilled: number; // delivered lines that should have an invoice and don't
}

export interface ShopDeliveriesMeta {
    accounting_enabled: boolean;
    tally_posting_enabled: boolean;
}

export interface Badge {
    label: string;
    cls: string;
    title?: string;
}

const GREEN = 'bg-green-500/20 text-green-400';
const AMBER = 'bg-amber-500/20 text-amber-300';
const RED = 'bg-red-500/20 text-red-300';
const GREY = 'bg-slate-700/50 text-slate-400';

/** Where an invoice stands with Tally. Posting off leaves every voucher queued. */
export function tallyBadge(invoice: ShopInvoice, postingEnabled: boolean): Badge {
    const { status, error, next_attempt_at: nextAt } = invoice.tally;
    switch (status) {
        case 'confirmed': return { label: 'In Tally', cls: GREEN };
        case 'merged': return { label: 'In Tally (day voucher)', cls: GREEN };
        case 'failed': return { label: 'Tally failed', cls: RED, title: error ?? undefined };
        case 'skipped': return { label: 'Not sent to Tally', cls: GREY, title: error ?? undefined };
        case 'pending':
            return postingEnabled
                ? { label: 'Tally queued', cls: AMBER, title: nextAt ? `Waits until ${nextAt}` : undefined }
                : { label: 'Tally posting off', cls: GREY, title: 'Turn on posting under Accounting → Tally' };
        default: return { label: 'Not queued', cls: GREY };
    }
}

/** One line of the day's billing for a shop, shown under its name. */
export function shopBillLabel(shop: ShopStop, accountingEnabled: boolean): Badge {
    if (!accountingEnabled) return { label: 'Accounting off — no bills', cls: GREY };
    if (shop.moved_to_day) {
        return shop.invoices.length
            ? { label: 'Billed by the day driver', cls: GREEN }
            : { label: 'Bills when the day driver delivers', cls: GREY };
    }
    if (shop.billing_cycle === 1) {
        return shop.invoices.length
            ? { label: 'Monthly bill made', cls: GREEN }
            : { label: 'Monthly — billed after the month ends', cls: GREY };
    }
    if (shop.billing_cycle === 2) {
        return shop.invoices.length
            ? { label: 'Weekly bill made', cls: GREEN }
            : { label: 'Weekly — billed on the statement day', cls: GREY };
    }
    if (shop.unbilled > 0) {
        return { label: `${shop.unbilled} delivered line${shop.unbilled === 1 ? '' : 's'} not billed`, cls: RED };
    }
    const delivered = shop.products.filter((p) => p.status === 3).length;
    if (delivered === 0) return { label: 'Nothing delivered yet', cls: GREY };
    return { label: 'Billed', cls: GREEN };
}

export interface ShopDaySummary {
    shops: number;
    done: number;
    invoices: number;
    billedAmount: number;
    unbilled: number;
    inTally: number;
    tallyQueued: number;
    tallyFailed: number;
}

/** Totals for the page header. Each invoice is counted once; cancelled ones are left out. */
export function summariseShopDay(shops: ShopStop[]): ShopDaySummary {
    const invoices = [...new Map(shops.flatMap((s) => s.invoices).map((inv) => [inv.id, inv])).values()]
        .filter((inv) => !inv.cancelled);
    const count = (statuses: Array<TallyStatus | null>) =>
        invoices.filter((inv) => statuses.includes(inv.tally.status)).length;
    return {
        shops: shops.length,
        done: shops.filter((s) => s.status === 3).length,
        invoices: invoices.length,
        billedAmount: invoices.reduce((sum, inv) => sum + inv.total_amount, 0),
        unbilled: shops.reduce((sum, s) => sum + s.unbilled, 0),
        inTally: count(['confirmed', 'merged']),
        tallyQueued: count(['pending']),
        tallyFailed: count(['failed']),
    };
}

/**
 * Shared helpers for the delivery-list and production-delivery pages.
 *
 * These were originally inlined in src/app/(dashboard)/delivery-list/page.tsx;
 * extracting them lets the driver-facing /production-delivery page reuse the
 * same shapes + logic without duplication. A bug fix here lands in both pages.
 */

// ====== Types ======

export interface DeliveryItem {
    id: number;
    pre_delivery_id: number;
    order_id: number;
    user_id: number;
    product_id: number;
    name: string;
    s_phone: string;
    title: string;
    product_title: string;
    qty: number;
    /** Live quantity scheduled for delivery — reflects edits made via the
     *  Qty Edit button (admin) or the driver app pre-mark adjustment. Comes
     *  from the `delivery` row, NOT the order. ALWAYS use this (with `qty`
     *  fallback) for routewise / packing / dairy aggregations and for any
     *  print-out a driver will see — `qty` is the static order quantity at
     *  creation time and won't reflect operator edits. */
    delivered_qty: number;
    qty_text: string;
    mark_delivered_qty: number | null;
    delivery_boy_id: number | null;
    delivery_boy_name: string | null;
    order_assign_user: number | null;
    status: number;
    delivered_date: string | null;
    mark_delivered_time_stamp: string | null;
    flat_no: string | null;
    apartment_name: string | null;
    area: string | null;
    city: string | null;
    pincode: string;
    wallet_amount: number;
    start_date: string;
    subscription_type: number;
    order_type: number;
    /** Transaction id for THIS delivery. For subscription orders this is
     *  the per-day wallet-debit (matched on delivery_date), not the
     *  order-level `trasation_id` (which can be months stale).  Null
     *  when the delivery hasn't been marked yet. */
    trasation_id: number | null;
    /** Order amount in rupees — the customer-facing total per delivery. */
    order_amount: number | null;
    /** Per-unit product price snapshotted on the order at creation. */
    product_price: number | null;
    /** Amount actually charged in the per-delivery transaction. Null
     *  when the delivery hasn't been marked yet (no debit row exists). */
    trasation_amount: number | null;
    /** Non-delivery / pending reason (Item 5). Bucketed into a performance
     *  category 1..4; null when no reason was recorded. */
    reason_category: number | null;
    reason: string | null;
}

// Performance buckets a non-delivery reason maps to. Keys match
// delivery.reason_category in the backend (1..4).
export const REASON_CATEGORIES: Record<number, string> = {
    1: 'Delivery Boy',
    2: 'Customer Care',
    3: 'Packaging',
    4: 'Driver',
};

export const getReasonCategoryLabel = (category: number | null | undefined): string =>
    category != null ? (REASON_CATEGORIES[category] ?? '-') : '-';

export interface ProductAgg {
    title: string;
    qty_text: string;
    qty: number;
}

export interface DriverGroup {
    driverName: string;
    products: ProductAgg[];
    totalQty: number;
}

// ====== Constants ======

/**
 * Driver name prefixes that count as dairy-pickup (NOT route-delivery).
 *
 * The match is `driverName.toLowerCase().startsWith(prefix)` so prefixes
 * tolerate trailing route names — i.e. '00 swarg office' on its own
 * already catches '00 Swarg office Nisarga Bheema', '00 Swarg office
 * Kanakpura', etc. The longer entries below are belt-and-suspenders
 * against a future edit that might tighten the matcher to exact-match.
 *
 * To add a new dairy-pickup driver: add their name (lowercased) here OR
 * just trust that the first numeric prefix is enough if it's "00 ..." or
 * "01 ...". Order doesn't matter for correctness — Array.some short-
 * circuits on the first hit.
 */
export const DAIRY_PICKUP_DRIVERS = [
    '00 swarg office',
    '00 swarg office nisarga bheema',
    '01  kanakpura',
    '01 kanakpura',
];

// ====== Helpers ======

/**
 * Resolve the live, current quantity for a delivery row.
 *
 * Prefers `delivered_qty` (from the `delivery` table, mutated by admin
 * Qty Edit and driver-app pre-mark adjustments) over the static `qty`
 * (from the `orders` table, snapshot at order creation). The latter
 * never changes after admin edits — using it in routewise/packing/
 * dairy aggregations is exactly the bug that put wrong totals on the
 * driver's printed list.
 *
 * **Zero is a meaningful value** — when the operator edits qty to 0
 * via the Qty Edit modal, it means "skip this delivery today" (not
 * "fall back to original qty"). The previous version of this helper
 * fell back to `item.qty` when `delivered_qty <= 0`, which silently
 * undid the operator's intent. We now treat `0` as a valid live qty;
 * the aggregators below filter it out so 0-qty rows don't appear on
 * route sheets at all.
 *
 * Falls back to `qty` only when `delivered_qty` is genuinely missing
 * (null/undefined/non-numeric) — i.e. legacy rows from before the
 * delivery-list generator started populating the column.
 */
function liveQty(item: DeliveryItem): number {
    const dq = item.delivered_qty;
    if (dq != null && Number.isFinite(dq)) return dq;
    return item.qty || 1;
}

/**
 * Match Laravel admin: null/unknown subscription_type renders as
 * "Normal Order / Non Subs" in customer-orders table.
 */
export const getSubscriptionLabel = (type: number | null | undefined) => {
    const types: Record<number, string> = {
        1: 'One Time Order',
        2: 'Weekly',
        3: 'Daily',
        4: 'Alternative Days',
    };
    if (type == null) return 'Normal Order / Non Subs';
    return types[type] || 'Normal Order / Non Subs';
};

export const getStatusLabel = (status: number) => {
    const map: Record<number, { label: string; color: string }> = {
        1: { label: 'Pending', color: 'text-slate-400' },
        2: { label: 'Not Delivered', color: 'text-red-400' },
        3: { label: 'Delivered', color: 'text-green-400' },
    };
    return map[status] || { label: 'N/A', color: 'text-slate-400' };
};

/** UI display — clean address without status suffix. */
export const composeAddress = (item: DeliveryItem) =>
    [item.flat_no, item.apartment_name, item.area, item.city, item.pincode]
        .filter(Boolean).join(', ') || '-';

/**
 * CSV export — exact Laravel parity:
 *   "Flat No. - <flat>, <apt>, <area>, <city>, <pincode>, <status>"
 * The trailing status number is a Laravel admin quirk we preserve for 1:1
 * export parity with what the legacy admin produced.
 */
export const composeAddressForExport = (item: DeliveryItem) => {
    const parts: (string | number | null)[] = [
        item.flat_no ? `Flat No. - ${item.flat_no}` : null,
        item.apartment_name || null,
        item.area || null,
        item.city || null,
        item.pincode || null,
        item.status,
    ];
    return parts
        .filter((p) => p !== null && p !== undefined && p !== '')
        .join(', ');
};

/**
 * Group items by driver → products.
 *
 * @param items all delivery rows for the selected day
 * @param dairyPickup when true, RETURNS only dairy-pickup driver groups;
 *                    when false, returns only route-delivery driver groups.
 *                    The two views are exclusive — same data source, opposite
 *                    filter. Drivers are ordered by their leading "NN " prefix
 *                    so "01 Kanakpura" < "02 JP Nagar" < ... < "10 ...".
 */
export function groupByDriver(items: DeliveryItem[], dairyPickup: boolean): DriverGroup[] {
    const driverMap = new Map<string, Map<string, ProductAgg>>();

    items.forEach((item) => {
        const driver = item.delivery_boy_name || 'Unassigned';
        const isPickupDriver = DAIRY_PICKUP_DRIVERS.some(
            (d) => driver.toLowerCase().startsWith(d)
        );
        // dairyPickup=true → keep ONLY pickup drivers; dairyPickup=false → keep ONLY route drivers.
        if (dairyPickup ? !isPickupDriver : isPickupDriver) return;

        if (!driverMap.has(driver)) driverMap.set(driver, new Map());
        const products = driverMap.get(driver)!;
        const key = item.product_title || item.title;
        if (!key) return;
        const q = liveQty(item);
        // Skip "don't deliver" rows — operator-zeroed via Qty Edit.
        // Without this, a row edited 36→0 still showed on the route sheet
        // because the aggregator (a) would never reach 0 if seeded fresh
        // and (b) would inherit a prior 36 if a sibling row aggregated first.
        if (q === 0) return;
        const existing = products.get(key);
        if (existing) {
            existing.qty += q;
        } else {
            products.set(key, {
                title: key,
                qty_text: item.qty_text || '',
                qty: q,
            });
        }
    });

    return Array.from(driverMap.entries())
        .map(([driverName, products]) => ({
            driverName,
            products: Array.from(products.values()).sort((a, b) => a.title.localeCompare(b.title)),
            totalQty: Array.from(products.values()).reduce((sum, p) => sum + p.qty, 0),
        }))
        .sort((a, b) => {
            const aNum = parseInt(a.driverName.match(/^(\d+)/)?.[1] || '999');
            const bNum = parseInt(b.driverName.match(/^(\d+)/)?.[1] || '999');
            if (aNum !== bNum) return aNum - bNum;
            return a.driverName.localeCompare(b.driverName);
        });
}

/**
 * Sum products across an arbitrary set of driver groups. Used to derive
 * "what goes on the delivery truck" — the routewise driver groups already
 * exclude dairy pickup, so this aggregator gives the truck-load summary
 * without having to re-filter the raw items.
 */
export function aggregateAcrossGroups(groups: DriverGroup[]): ProductAgg[] {
    const map = new Map<string, ProductAgg>();
    for (const g of groups) {
        for (const p of g.products) {
            const existing = map.get(p.title);
            if (existing) {
                existing.qty += p.qty;
            } else {
                map.set(p.title, { ...p });
            }
        }
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/** Aggregate products by title (across all drivers) — for the packing list. */
export function aggregateProducts(items: DeliveryItem[]): ProductAgg[] {
    const map = new Map<string, ProductAgg>();
    items.forEach((item) => {
        const key = item.product_title || item.title;
        if (!key) return;
        const q = liveQty(item);
        if (q === 0) return; // skip operator-zeroed rows — same rationale as groupByDriver
        const existing = map.get(key);
        if (existing) {
            existing.qty += q;
        } else {
            map.set(key, {
                title: key,
                qty_text: item.qty_text || '',
                qty: q,
            });
        }
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Deduplicate raw delivery rows by pre_delivery_id, preferring the row that
 * has driver info (delivery_boy_name). Guards against historical one-to-many
 * rows from order_user_assign slipping past the backend's latest-assignment
 * subquery.
 */
export function dedupeDeliveryItems(rows: DeliveryItem[]): DeliveryItem[] {
    const byId = new Map<number, DeliveryItem>();
    rows.forEach((item) => {
        const existing = byId.get(item.pre_delivery_id);
        if (!existing) {
            byId.set(item.pre_delivery_id, item);
            return;
        }
        if (!existing.delivery_boy_name && item.delivery_boy_name) {
            byId.set(item.pre_delivery_id, item);
        }
    });
    return Array.from(byId.values());
}

/**
 * Build a CSV blob URL for the routewise/dairy "driver → products" view.
 * Returns the URL — caller is responsible for revoking via URL.revokeObjectURL().
 */
export function driverGroupsToCsvUrl(groups: DriverGroup[], dateLabel: string): string {
    const rows: string[][] = [['Delivery Boy', 'Product Title', 'Quantity Text', 'Quantity']];
    for (const g of groups) {
        for (const p of g.products) {
            rows.push([g.driverName, p.title, p.qty_text, String(p.qty)]);
        }
    }
    const csv = rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    void dateLabel; // currently unused in CSV body but kept in signature for future header row
    const blob = new Blob([csv], { type: 'text/csv' });
    return URL.createObjectURL(blob);
}

/**
 * Build a CSV blob URL for the packing list (flat product → qty).
 * Returns the URL — caller is responsible for revoking via URL.revokeObjectURL().
 */
export function productsToCsvUrl(products: ProductAgg[]): string {
    const rows: string[][] = [['Product Title', 'Quantity Text', 'Quantity']];
    for (const p of products) {
        rows.push([p.title, p.qty_text, String(p.qty)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    return URL.createObjectURL(blob);
}

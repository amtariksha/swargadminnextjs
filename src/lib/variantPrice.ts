/**
 * A size's prices, as swargnodejsbackend's utils/variations/variantPricing.js
 * defines them: regular_price is the size's MRP, sale_price is what customers pay
 * while its dates are open (a blank date leaves that side open).
 */
export interface SizePrices {
    // unknown so both typed variants and raw storefront rows fit.
    regular_price?: unknown;
    sale_price?: unknown;
    sale_starts_at?: unknown;
    sale_ends_at?: unknown;
}

const positive = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** Is the size's sale on at `now`? An unparseable date closes it, like the backend. */
export function isSaleOpen(size: SizePrices, now: Date = new Date()): boolean {
    for (const [raw, isStart] of [[size.sale_starts_at, true], [size.sale_ends_at, false]] as const) {
        if (raw == null || raw === '') continue;
        const at = new Date(raw instanceof Date ? raw : String(raw));
        if (Number.isNaN(at.getTime())) return false;
        if (isStart ? now < at : now > at) return false;
    }
    return true;
}

/** What a customer pays for the size now: sale price while open, else regular price. */
export function sizeSellingPrice(size: SizePrices | null | undefined, now: Date = new Date()): number | null {
    if (!size) return null;
    const sale = positive(size.sale_price);
    if (sale != null && isSaleOpen(size, now)) return sale;
    return positive(size.regular_price);
}

/** The size with a sale price outside its dates dropped — for customer-facing payloads. */
export function withLiveSalePrice<T extends SizePrices>(size: T, now: Date = new Date()): T {
    if (size.sale_price == null || isSaleOpen(size, now)) return size;
    return { ...size, sale_price: null };
}

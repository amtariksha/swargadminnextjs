/**
 * A size's selling price (src/lib/variantPrice.ts) — mirrors the backend's
 * sizeSellingPrice / withLiveSalePrice: regular_price is the size's MRP,
 * sale_price is what customers pay while its dates are open.
 */
import { describe, it, expect } from 'vitest';
import { isSaleOpen, sizeSellingPrice, withLiveSalePrice } from '@/lib/variantPrice';

const NOW = new Date('2026-10-28T06:00:00Z');

describe('sizeSellingPrice', () => {
    it('is the sale price with no dates (always open)', () => {
        expect(sizeSellingPrice({ regular_price: 249, sale_price: 149 }, NOW)).toBe(149);
    });

    it('is the sale price inside its dates', () => {
        expect(sizeSellingPrice({
            regular_price: 249, sale_price: 149,
            sale_starts_at: '2026-10-01T00:00:00Z', sale_ends_at: '2026-11-01T00:00:00Z',
        }, NOW)).toBe(149);
    });

    it('is the regular price before or after the sale', () => {
        expect(sizeSellingPrice({ regular_price: 249, sale_price: 149, sale_ends_at: '2026-10-01T00:00:00Z' }, NOW)).toBe(249);
        expect(sizeSellingPrice({ regular_price: 249, sale_price: 149, sale_starts_at: '2026-11-01T00:00:00Z' }, NOW)).toBe(249);
    });

    it('reads numeric strings and falls back to null', () => {
        expect(sizeSellingPrice({ regular_price: '560.00', sale_price: null }, NOW)).toBe(560);
        expect(sizeSellingPrice({ regular_price: null, sale_price: null }, NOW)).toBeNull();
        expect(sizeSellingPrice(undefined, NOW)).toBeNull();
    });

    it('an unparseable date closes the sale, like the backend', () => {
        expect(isSaleOpen({ sale_ends_at: 'not a date' }, NOW)).toBe(false);
    });
});

describe('withLiveSalePrice', () => {
    it('drops a sale price outside its dates and leaves the input alone', () => {
        const v = { id: 88, regular_price: 249, sale_price: 149, sale_ends_at: '2026-10-01 00:00:00' };
        expect(withLiveSalePrice(v, NOW)).toEqual({ ...v, sale_price: null });
        expect(v.sale_price).toBe(149);
    });

    it('keeps an open sale price', () => {
        const v = { id: 88, regular_price: 249, sale_price: 149 };
        expect(withLiveSalePrice(v, NOW)).toBe(v);
    });
});

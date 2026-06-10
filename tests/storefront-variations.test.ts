/**
 * Parity tests for the TS ports of swargnodejsbackend's variation shapers
 * (src/lib/storefront/variations.ts). Mirrors the originals' semantics —
 * these shapes back the swargfooddotcom ₹0 fix.
 */
import { describe, it, expect } from 'vitest';
import {
    buildAttributeMatrix,
    pickDefaultVariant,
    priceRange,
    resolveBackorder,
} from '@/lib/storefront/variations';

const variant = (over: Record<string, unknown> = {}) => ({
    id: 1, slug: 'v', sku: null, qty_text: '500g', regular_price: 100,
    sale_price: null, image_url: null, stock_status: 'in_stock',
    stock_quantity: 5, allow_back_order: null, is_default: 0, sort_order: 0,
    is_active: 1, archived_at: null, attribute_pairs: [], ...over,
});

describe('priceRange', () => {
    it('spans active in-stock variants and skips out_of_stock + non-positive prices', () => {
        const r = priceRange([
            variant({ id: 1, regular_price: 150 }),
            variant({ id: 2, regular_price: 600 }),
            variant({ id: 3, regular_price: 50, stock_status: 'out_of_stock' }),
            variant({ id: 4, regular_price: 0 }),
            variant({ id: 5, regular_price: 999, is_active: 0 }),
        ]);
        expect(r).toEqual({ min: 150, max: 600 });
    });

    it('returns nulls for empty/no-usable input', () => {
        expect(priceRange([])).toEqual({ min: null, max: null });
        expect(priceRange([variant({ regular_price: 0 })])).toEqual({ min: null, max: null });
    });
});

describe('pickDefaultVariant', () => {
    it('prefers is_default=1 among active variants', () => {
        const picked = pickDefaultVariant([
            variant({ id: 1, sort_order: 0 }),
            variant({ id: 2, is_default: 1, sort_order: 9 }),
        ]);
        expect(picked?.id).toBe(2);
    });

    it('falls back to lowest sort_order then id, skipping inactive/archived', () => {
        const picked = pickDefaultVariant([
            variant({ id: 3, sort_order: 2 }),
            variant({ id: 4, sort_order: 1 }),
            variant({ id: 5, sort_order: 0, is_active: 0 }),
            variant({ id: 6, sort_order: 0, archived_at: '2026-01-01' }),
        ]);
        expect(picked?.id).toBe(4);
    });

    it('returns null when nothing is usable', () => {
        expect(pickDefaultVariant([])).toBeNull();
        expect(pickDefaultVariant([variant({ is_active: 0 })])).toBeNull();
    });
});

describe('resolveBackorder', () => {
    const product = { allow_back_order: 1, back_order_next_available: '2026-07-01' };

    it('variant non-NULL override wins (including OFF)', () => {
        expect(resolveBackorder({ product, variant: variant({ allow_back_order: 0 }) }))
            .toEqual({ allowed: false, nextAvailable: null, source: 'variant' });
    });

    it('variant ON without a date inherits the parent date', () => {
        const r = resolveBackorder({ product, variant: variant({ allow_back_order: 1 }) });
        expect(r).toEqual({ allowed: true, nextAvailable: '2026-07-01', source: 'variant' });
    });

    it('NULL variant flag inherits from the parent', () => {
        const r = resolveBackorder({ product, variant: variant({ allow_back_order: null }) });
        expect(r).toEqual({ allowed: true, nextAvailable: '2026-07-01', source: 'product' });
    });

    it('no config anywhere → none', () => {
        expect(resolveBackorder({})).toEqual({ allowed: false, nextAvailable: null, source: 'none' });
    });
});

describe('buildAttributeMatrix', () => {
    const attributeRows = [
        { attribute_id: 10, name: 'Size', slug: 'size', display_type: 'dropdown', is_variation_defining: 1, is_visible: 1, sort_order: 0 },
        { attribute_id: 20, name: 'Origin', slug: 'origin', display_type: 'dropdown', is_variation_defining: 0, is_visible: 1, sort_order: 1 },
    ];
    const valueRows = [
        { attribute_id: 10, value_id: 101, value: '500 g', slug: '500-g', swatch_color: null, swatch_image_url: null, sort_order: 0 },
        { attribute_id: 20, value_id: 201, value: 'Farm', slug: 'farm', swatch_color: null, swatch_image_url: null, sort_order: 0 },
    ];
    const variantRows = [
        variant({ id: 7, attribute_pairs: [{ attribute_id: 10, attribute_value_id: 101 }] }),
    ];

    it('splits variation-defining vs display attributes and enriches pairs with names', () => {
        const m = buildAttributeMatrix({ attributeRows, valueRows, variantRows });
        expect(m.attributes).toHaveLength(1);
        expect(m.attributes[0]).toMatchObject({ attribute_id: 10, name: 'Size' });
        expect(m.display_attributes).toHaveLength(1);
        expect(m.display_attributes[0]).toMatchObject({ attribute_id: 20, name: 'Origin' });
        expect(m.variants[0]).toMatchObject({ variant_id: 7, regular_price: 100, is_default: false });
        const pairs = m.variants[0].attribute_pairs as Array<Record<string, unknown>>;
        expect(pairs[0]).toMatchObject({
            attribute_id: 10, attribute_name: 'Size', value_id: 101, value: '500 g', value_slug: '500-g',
        });
    });
});

/**
 * Shared TypeScript types for the Product Variations feature.
 *
 * Mirror of the database schema in
 * swargnodejsbackend/scripts/migrations/postgres/app_db/030_product_variations.sql
 * and the controller shapes in src/controllers/{attribute,variant,storefront,…}Controller.js.
 *
 * Field naming matches the JSON returned by the backend (snake_case).
 */

export type DisplayType = 'dropdown' | 'radio' | 'swatch_color' | 'swatch_image' | 'button';
export type StockStatus = 'in_stock' | 'out_of_stock' | 'on_backorder';
export type NotifyChannel = 'whatsapp' | 'email' | 'sms' | 'push';
export type ProductType = 'simple' | 'variable';
export type StockManagedAt = 'variant' | 'parent';

export interface Attribute {
    id: number;
    product_id: number | null;          // NULL = global
    name: string;
    slug: string;
    display_type: DisplayType;
    is_filterable: number;              // SMALLINT, 0/1
    sort_order: number;
    created_at?: string;
    updated_at?: string;
    values?: AttributeValue[];          // optional eager-load
}

export interface AttributeValue {
    id: number;
    attribute_id: number;
    value: string;
    slug: string;
    swatch_color?: string | null;
    swatch_image_url?: string | null;
    sort_order: number;
    archived_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface ProductAttributeAssignment {
    product_attribute_id: number;
    attribute_id: number;
    name: string;
    slug: string;
    display_type: DisplayType;
    is_variation_defining: number;      // SMALLINT
    is_visible: number;                 // SMALLINT
    sort_order: number;
    values?: AssignedAttributeValue[];
}

export interface AssignedAttributeValue {
    product_attribute_value_id: number;
    product_attribute_id: number;
    attribute_value_id: number;
    value: string;
    slug: string;
    swatch_color?: string | null;
    swatch_image_url?: string | null;
    sort_order: number;
}

export interface VariantAttributePair {
    attribute_id: number;
    attribute_value_id: number | null;  // NULL = "Any" (Phase 2)
    attribute_name?: string;
    attribute_slug?: string;
    value?: string;
    value_slug?: string;
}

export interface Variant {
    id: number;
    product_id: number;
    slug: string;
    sku?: string | null;
    qty_text?: string | null;
    regular_price?: number | null;
    sale_price?: number | null;
    sale_starts_at?: string | null;
    sale_ends_at?: string | null;
    cost_price?: number | null;
    stock_quantity?: number | null;
    manage_stock: number;
    stock_status: StockStatus;
    allow_back_order?: number | null;
    back_order_next_available?: string | null;
    low_stock_threshold?: number | null;
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    shipping_class_id?: number | null;
    tax_class_id?: number | null;
    image_url?: string | null;
    short_description?: string | null;
    is_active: number;
    is_default: number;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
    archived_at?: string | null;
    attribute_pairs?: VariantAttributePair[];
}

export interface VariantCreatePayload {
    slug?: string;
    sku?: string | null;
    qty_text?: string | null;
    regular_price?: number | null;
    sale_price?: number | null;
    sale_starts_at?: string | null;
    sale_ends_at?: string | null;
    cost_price?: number | null;
    stock_quantity?: number | null;
    manage_stock?: number;
    stock_status?: StockStatus;
    allow_back_order?: number | null;
    back_order_next_available?: string | null;
    low_stock_threshold?: number | null;
    weight?: number | null;
    image_url?: string | null;
    short_description?: string | null;
    is_active?: number;
    is_default?: number;
    sort_order?: number;
    attribute_pairs: Array<{ attribute_id: number; attribute_value_id: number }>;
}

export interface VariantGeneratePayload {
    attributes: Array<{ attribute_id: number; value_ids: number[] }>;
    defaults?: Partial<Omit<VariantCreatePayload, 'attribute_pairs' | 'slug'>> & { qty_text?: string | null };
}

export interface VariantGenerateResult {
    created: number;
    skipped: number;
    soft_warn: boolean;
    combination_count: number;
    variant_ids: number[];
}

export interface NotifyRequest {
    id: number;
    user_id?: number | null;
    email?: string | null;
    phone?: string | null;
    product_id: number;
    variant_id?: number | null;
    channel: NotifyChannel;
    requested_at: string;
    notified_at?: string | null;
    product_title?: string;
    variant_slug?: string;
}

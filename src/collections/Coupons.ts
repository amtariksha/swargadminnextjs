import type { CollectionConfig } from 'payload'

export const Coupons: CollectionConfig = {
  slug: 'coupons',
  labels: { singular: 'Coupon', plural: 'Coupons' },
  admin: {
    useAsTitle: 'code',
    group: 'Commerce',
  },
  fields: [
    { name: 'code', type: 'text', required: true, unique: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Percentage', value: 'percentage' },
        { label: 'Fixed Amount', value: 'fixed' },
      ],
    },
    {
      name: 'value',
      type: 'number',
      required: true,
      admin: { description: 'Discount value (% or INR)' },
    },
    { name: 'minOrderAmount', type: 'number', defaultValue: 0 },
    {
      name: 'maxDiscount',
      type: 'number',
      admin: { description: 'Maximum discount cap (for percentage coupons)' },
    },
    { name: 'maxUses', type: 'number', admin: { description: 'Total usage limit' } },
    { name: 'usesPerCustomer', type: 'number', defaultValue: 1 },
    { name: 'currentUses', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'validFrom', type: 'date', required: true },
    { name: 'validTo', type: 'date', required: true },
    {
      name: 'applicableZones',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Bangalore Only', value: 'bangalore_only' },
        { label: 'Bangalore Extended', value: 'bangalore_extended' },
        { label: 'All India', value: 'all_india' },
      ],
    },
    { name: 'applicableProducts', type: 'relationship', relationTo: 'products', hasMany: true },
    { name: 'applicableCategories', type: 'relationship', relationTo: 'categories', hasMany: true },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    { name: 'wpId', type: 'text', index: true, admin: { hidden: true, description: 'Legacy WordPress / WooCommerce shop_coupon ID for migration idempotency.' } },
  ],
}

import type { GlobalConfig } from 'payload'

export const CommerceSettings: GlobalConfig = {
  slug: 'commerce-settings',
  label: 'Commerce Settings',
  admin: {
    group: 'Settings',
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'currency', type: 'text', defaultValue: 'INR', admin: { readOnly: true } },
    { name: 'currencySymbol', type: 'text', defaultValue: '₹', admin: { readOnly: true } },
    { name: 'pricesIncludeTax', type: 'checkbox', defaultValue: false, admin: { description: 'Whether displayed prices include GST' } },
    { name: 'gstinNumber', type: 'text', admin: { description: 'Swarg GSTIN for invoices' } },
    { name: 'freeDeliveryThreshold', type: 'number', defaultValue: 500, admin: { description: 'Free delivery for orders above this amount (INR)' } },
    { name: 'freeDeliveryRadius', type: 'number', defaultValue: 5, admin: { description: 'Free delivery radius in km' } },
    { name: 'minOrderAmount', type: 'number', defaultValue: 0, admin: { description: 'Minimum order amount' } },
    { name: 'codEnabled', type: 'checkbox', defaultValue: true },
    { name: 'codMaxAmount', type: 'number', defaultValue: 5000, admin: { description: 'Max order value for COD' } },
    {
      name: 'codAvailableZones',
      type: 'select',
      hasMany: true,
      defaultValue: ['bangalore_only', 'bangalore_extended'],
      options: [
        { label: 'Bangalore Only', value: 'bangalore_only' },
        { label: 'Bangalore Extended', value: 'bangalore_extended' },
        { label: 'All India', value: 'all_india' },
      ],
    },
    { name: 'defaultShippingEstimate', type: 'text', defaultValue: '3-5 business days' },
    { name: 'estimatedShippingNote', type: 'text', defaultValue: 'Actual courier charges may vary for non-Bangalore orders.' },
    {
      name: 'invoicePrefix',
      type: 'text',
      defaultValue: 'SF',
      admin: { description: 'Invoice number prefix e.g. SF/2026-27/00001' },
    },
    { name: 'currentInvoiceNumber', type: 'number', defaultValue: 0, admin: { description: 'Auto-incremented. Reset annually on April 1.' } },
    // Sync metadata
    {
      name: 'lastSyncResult',
      type: 'textarea',
      admin: {
        readOnly: true,
        description: 'JSON blob of the last product sync result (auto-updated by sync bridge)',
      },
    },
  ],
}

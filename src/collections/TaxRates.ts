import type { CollectionConfig } from 'payload'

export const TaxRates: CollectionConfig = {
  slug: 'tax-rates',
  labels: { singular: 'Tax Rate', plural: 'Tax Rates' },
  admin: {
    useAsTitle: 'taxName',
    group: 'Commerce',
    // Vestigial — GST is HSN-based in the node backend, not these Payload rows.
    // Kept only because Products.taxRate relates to it; hidden from the nav.
    hidden: true,
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'hsnCode',
      type: 'text',
      required: true,
      admin: { description: 'HSN code e.g. 0401 for milk, 0405 for ghee' },
    },
    {
      name: 'taxName',
      type: 'text',
      required: true,
      admin: { description: 'Display name e.g. "GST 5%"' },
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'cgstRate',
      type: 'number',
      required: true,
      admin: { description: 'Central GST rate e.g. 2.5 for 5% total' },
    },
    {
      name: 'sgstRate',
      type: 'number',
      required: true,
      admin: { description: 'State GST rate e.g. 2.5 for intra-state' },
    },
    {
      name: 'igstRate',
      type: 'number',
      required: true,
      admin: { description: 'Integrated GST rate e.g. 5 for inter-state' },
    },
    { name: 'cessRate', type: 'number', defaultValue: 0 },
    { name: 'isActive', type: 'checkbox', defaultValue: true },
  ],
}

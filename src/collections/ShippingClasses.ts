import type { CollectionConfig } from 'payload'

export const ShippingClasses: CollectionConfig = {
  slug: 'shipping-classes',
  labels: { singular: 'Shipping Class', plural: 'Shipping Classes' },
  admin: {
    useAsTitle: 'className',
    group: 'Commerce',
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'className', type: 'text', required: true },
    { name: 'maxWeightGrams', type: 'number', required: true },
    {
      name: 'baseCost',
      type: 'number',
      required: true,
      admin: { description: 'Base shipping cost for this class' },
    },
    { name: 'costPerAdditionalKg', type: 'number', defaultValue: 0 },
    { name: 'description', type: 'textarea' },
  ],
}

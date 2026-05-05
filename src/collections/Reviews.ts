import type { CollectionConfig } from 'payload'

export const Reviews: CollectionConfig = {
  slug: 'reviews',
  labels: { singular: 'Review', plural: 'Reviews' },
  admin: {
    defaultColumns: ['product', 'customer', 'rating', 'status', 'createdAt'],
    group: 'Commerce',
  },
  fields: [
    { name: 'product', type: 'relationship', relationTo: 'products', required: true },
    { name: 'customer', type: 'relationship', relationTo: 'customers', required: true },
    { name: 'rating', type: 'number', required: true, min: 1, max: 5 },
    { name: 'title', type: 'text' },
    { name: 'body', type: 'textarea', required: true },
    {
      name: 'verified',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'True if customer has a delivered order with this product' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'adminReply', type: 'textarea' },
  ],
  timestamps: true,
}

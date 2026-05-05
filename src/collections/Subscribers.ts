import type { CollectionConfig } from 'payload'

export const Subscribers: CollectionConfig = {
  slug: 'subscribers',
  labels: { singular: 'Subscriber', plural: 'Subscribers' },
  admin: {
    defaultColumns: ['email', 'phone', 'source', 'whatsappOptIn', 'createdAt'],
    group: 'Communication',
  },
  fields: [
    { name: 'phone', type: 'text' },
    { name: 'email', type: 'email' },
    { name: 'whatsappOptIn', type: 'checkbox', defaultValue: false },
    { name: 'emailOptIn', type: 'checkbox', defaultValue: false },
    {
      name: 'source',
      type: 'select',
      options: [
        { label: 'Homepage', value: 'homepage' },
        { label: 'Checkout', value: 'checkout' },
        { label: 'Contact Page', value: 'contact' },
        { label: 'Blog', value: 'blog' },
      ],
    },
    { name: 'subscribedAt', type: 'date', required: true },
  ],
  timestamps: true,
}

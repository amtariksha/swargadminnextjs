import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { revalidateFrontend, revalidateFrontendDelete } from '../hooks/revalidateFrontend'

export const FAQs: CollectionConfig = {
  slug: 'faqs',
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    defaultColumns: ['question', 'category', 'isActive', 'displayOrder'],
    useAsTitle: 'question',
    description: 'Frequently asked questions, grouped by category.',
  },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
    },
    {
      name: 'answer',
      type: 'richText',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      defaultValue: 'general',
      options: [
        { label: 'General', value: 'general' },
        { label: 'Product', value: 'product' },
        { label: 'Shipping', value: 'shipping' },
        { label: 'Payment', value: 'payment' },
        { label: 'Refund / Return', value: 'refund' },
        { label: 'Account', value: 'account' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar', description: 'Order within the category.' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'wpId',
      type: 'text',
      index: true,
      admin: { hidden: true, description: 'Legacy WordPress ID for migration idempotency.' },
    },
  ],
  hooks: {
    afterChange: [revalidateFrontend('/faq')],
    afterDelete: [revalidateFrontendDelete('/faq')],
  },
  timestamps: true,
}

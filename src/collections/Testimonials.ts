import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { revalidateFrontend, revalidateFrontendDelete } from '../hooks/revalidateFrontend'

export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'title', 'rating', 'isActive', 'displayOrder'],
    useAsTitle: 'name',
    description: 'Customer testimonials shown on the marketing site (homepage slider, landing pages).',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'title',
      type: 'text',
      admin: { description: 'Role / location, e.g. "Mother of two, Bangalore"' },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'quote',
      type: 'richText',
      required: true,
    },
    {
      name: 'rating',
      type: 'number',
      min: 1,
      max: 5,
      admin: { description: '1–5 stars (optional).' },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      admin: {
        description: 'Optional — link the testimonial to a specific product.',
      },
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar', description: 'Lower number = shown first.' },
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
    afterChange: [revalidateFrontend('/')],
    afterDelete: [revalidateFrontendDelete('/')],
  },
  timestamps: true,
}

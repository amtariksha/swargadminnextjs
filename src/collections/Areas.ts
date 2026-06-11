import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { revalidateFrontend, revalidateFrontendDelete } from '../hooks/revalidateFrontend'

/**
 * Delivery-area landing pages (/delivery-areas/[slug]) for local SEO —
 * deep, editorial pages per Bangalore locality: apartments served, slot
 * timings, local testimonials and FAQs. Serviceability truth stays in the
 * ops backend (delivery locations); this collection holds the editorial
 * content and references the backend location by id.
 */
export const Areas: CollectionConfig = {
  slug: 'areas',
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    group: 'Marketing',
    defaultColumns: ['name', 'slug', 'active'],
    useAsTitle: 'name',
    description:
      'Delivery-area pages (e.g. Whitefield, HSR Layout). Write real local detail — apartments served, delivery window — not template copy.',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'URL part: /delivery-areas/<slug>, e.g. whitefield' },
    },
    {
      name: 'headline',
      type: 'text',
      admin: { description: 'e.g. "Fresh A2 milk in Whitefield, before 8 AM every morning"' },
    },
    { name: 'intro', type: 'richText' },
    {
      name: 'apartments',
      type: 'array',
      admin: {
        description: 'Apartment complexes we already deliver to in this area — the trust anchor.',
      },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'landmark', type: 'text' },
      ],
    },
    {
      name: 'pincodes',
      type: 'array',
      fields: [{ name: 'pincode', type: 'text', required: true }],
    },
    {
      name: 'deliveryWindow',
      type: 'text',
      admin: { description: 'e.g. "5:30 – 8:00 AM", position: sidebar' },
    },
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
    {
      name: 'locationId',
      type: 'number',
      admin: {
        position: 'sidebar',
        description: 'Ops backend delivery-location id this area maps to (for the pincode checker).',
      },
    },
    {
      name: 'meta',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
  ],
  hooks: {
    afterChange: [revalidateFrontend('/delivery-areas')],
    afterDelete: [revalidateFrontendDelete('/delivery-areas')],
  },
  timestamps: true,
}

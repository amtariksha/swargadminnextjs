import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { revalidateFrontend, revalidateFrontendDelete } from '../hooks/revalidateFrontend'

/**
 * Manually curated Instagram grid for the marketing site. Zero Instagram API
 * dependency: an editor uploads the image and pastes the post URL. The
 * `source` field is the seam for a later Graph-API sync job, which would
 * upsert docs with source='graph-api' — the frontend grid never changes.
 */
export const InstagramPosts: CollectionConfig = {
  slug: 'instagram-posts',
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    group: 'Marketing',
    defaultColumns: ['caption', 'postedAt', 'source'],
    useAsTitle: 'caption',
    description:
      'Curated Instagram tiles shown on the website. Upload the image and paste the post link — 6–9 recent posts is ideal.',
  },
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
      admin: { description: 'Short caption — used as the image alt text.' },
    },
    {
      name: 'postUrl',
      type: 'text',
      required: true,
      admin: { description: 'Link to the Instagram post, e.g. https://www.instagram.com/p/…' },
    },
    {
      name: 'postedAt',
      type: 'date',
      admin: { position: 'sidebar' },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Graph API', value: 'graph-api' },
      ],
      admin: { hidden: true },
    },
  ],
  hooks: {
    afterChange: [revalidateFrontend('/')],
    afterDelete: [revalidateFrontendDelete('/')],
  },
  timestamps: true,
}

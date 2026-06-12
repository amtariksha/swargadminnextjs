import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { revalidateFrontend, revalidateFrontendDelete } from '../hooks/revalidateFrontend'

/** "As seen in" press strip + quotes for the story page. */
export const PressMentions: CollectionConfig = {
  slug: 'press-mentions',
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    group: 'Marketing',
    defaultColumns: ['outlet', 'title', 'publishedAt'],
    useAsTitle: 'outlet',
  },
  fields: [
    { name: 'outlet', type: 'text', required: true },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'title', type: 'text' },
    { name: 'url', type: 'text' },
    { name: 'publishedAt', type: 'date', admin: { position: 'sidebar' } },
    { name: 'quote', type: 'textarea', admin: { description: 'Optional pull-quote from the article.' } },
  ],
  hooks: {
    afterChange: [revalidateFrontend('/our-story')],
    afterDelete: [revalidateFrontendDelete('/our-story')],
  },
  timestamps: true,
}

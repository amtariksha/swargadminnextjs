import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const Tags: CollectionConfig = {
  slug: 'tags',
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'slug'],
    useAsTitle: 'title',
    description: 'Tags for Posts, Recipes, and Products. Distinct from Categories (which are hierarchical).',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'text' },
    {
      name: 'color',
      type: 'text',
      admin: { description: 'Optional hex colour for badges, e.g. "#7c3aed".' },
    },
    slugField(),
    {
      name: 'wpId',
      type: 'text',
      index: true,
      admin: { hidden: true, description: 'Legacy WordPress ID for migration idempotency.' },
    },
  ],
  timestamps: true,
}

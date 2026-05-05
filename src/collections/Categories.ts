import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'title',
    group: 'Commerce',
  },
  fields: [
    { name: 'mysqlId', type: 'number', unique: true, index: true, admin: { description: 'ID from Swarg MySQL' } },
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'bannerImage', type: 'upload', relationTo: 'media' },
    { name: 'description', type: 'richText' },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
    { name: 'isActive', type: 'checkbox', defaultValue: true },
    { name: 'parent', type: 'relationship', relationTo: 'categories', admin: { description: 'Parent category for nesting' } },
  ],
}

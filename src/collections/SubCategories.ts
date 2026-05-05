import type { CollectionConfig } from 'payload'

export const SubCategories: CollectionConfig = {
  slug: 'sub-categories',
  labels: { singular: 'Sub Category', plural: 'Sub Categories' },
  admin: {
    useAsTitle: 'title',
    group: 'Commerce',
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'mysqlId', type: 'number', unique: true, index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', unique: true, required: true },
    { name: 'category', type: 'relationship', relationTo: 'categories', required: true },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'isActive', type: 'checkbox', defaultValue: true },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
  ],
}

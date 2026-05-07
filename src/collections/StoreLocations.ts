import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

export const StoreLocations: CollectionConfig = {
  slug: 'store-locations',
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'address.city', 'phone', 'isActive', 'displayOrder'],
    useAsTitle: 'name',
    description: 'Physical store / pickup point locations displayed on /our-stores.',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'e.g. "Swarg Food — Indiranagar"' },
    },
    {
      name: 'address',
      type: 'group',
      fields: [
        { name: 'line1', type: 'text', required: true },
        { name: 'line2', type: 'text' },
        { name: 'city', type: 'text', required: true },
        { name: 'state', type: 'text', required: true },
        { name: 'pincode', type: 'text', required: true },
      ],
    },
    {
      name: 'phone',
      type: 'text',
    },
    {
      name: 'email',
      type: 'email',
    },
    {
      name: 'hours',
      type: 'array',
      admin: { description: 'Operating hours per day of week.' },
      fields: [
        {
          name: 'day',
          type: 'select',
          options: [
            { label: 'Monday', value: 'mon' },
            { label: 'Tuesday', value: 'tue' },
            { label: 'Wednesday', value: 'wed' },
            { label: 'Thursday', value: 'thu' },
            { label: 'Friday', value: 'fri' },
            { label: 'Saturday', value: 'sat' },
            { label: 'Sunday', value: 'sun' },
          ],
          required: true,
        },
        { name: 'openTime', type: 'text', admin: { description: 'e.g. "09:00"' } },
        { name: 'closeTime', type: 'text', admin: { description: 'e.g. "21:00"' } },
        { name: 'closed', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'mapEmbedUrl',
      type: 'text',
      admin: { description: 'Google Maps iframe src URL (optional).' },
    },
    {
      name: 'latitude',
      type: 'number',
      admin: { description: 'For map markers / distance calculations.' },
    },
    {
      name: 'longitude',
      type: 'number',
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar' },
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
  timestamps: true,
}

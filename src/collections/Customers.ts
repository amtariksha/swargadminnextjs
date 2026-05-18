import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'

export const Customers: CollectionConfig = {
  slug: 'customers',
  labels: { singular: 'Customer', plural: 'Customers' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'phone', 'email', 'zone', 'createdAt'],
    group: 'Commerce',
  },
  // Customer records contain PII (phone, email, addresses). The previous
  // `read: () => true` left them readable by anonymous callers via the
  // Payload REST API — that's a leak. Tightened to authenticated-only.
  // Role-based scoping (admin vs operator) is a separate feature; the
  // codebase doesn't have role hierarchy yet.
  access: {
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  fields: [
    { name: 'phone', type: 'text', unique: true, required: true, index: true },
    { name: 'name', type: 'text' },
    { name: 'email', type: 'email' },
    {
      name: 'addresses',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', admin: { description: 'e.g. Home, Office' } },
        { name: 'line1', type: 'text', required: true },
        { name: 'line2', type: 'text' },
        { name: 'city', type: 'text', required: true },
        { name: 'state', type: 'text', required: true },
        { name: 'pincode', type: 'text', required: true },
        { name: 'isDefault', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'zone',
      type: 'select',
      options: [
        { label: 'Bangalore Core', value: 'bangalore_core' },
        { label: 'Bangalore Extended', value: 'bangalore_extended' },
        { label: 'Karnataka', value: 'karnataka' },
        { label: 'All India', value: 'all_india' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'mysqlUserId',
      type: 'number',
      admin: { description: 'If they also have a Swarg app account' },
    },
    { name: 'whatsappOptIn', type: 'checkbox', defaultValue: false },
    { name: 'newsletterOptIn', type: 'checkbox', defaultValue: false },
    { name: 'lastOrderAt', type: 'date' },

    // Legacy
    { name: 'legacyWpId', type: 'number', admin: { description: 'Deprecated — kept for backward compat. Migration script writes to wpId (text) instead.' } },
    { name: 'wpId', type: 'text', index: true, admin: { hidden: true, description: 'Legacy WordPress user ID for migration idempotency.' } },
    { name: 'isLegacy', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar' } },
  ],
  timestamps: true,
}

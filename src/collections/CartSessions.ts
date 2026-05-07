import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

/**
 * CartSessions — server-side cart snapshots used to detect abandonment and
 * trigger WhatsApp/email recovery flows.
 *
 * Frontend posts to /api/cart/sync on every cart mutation (debounced ~5s).
 * A cron job (every 30 min) finds sessions where:
 *   - lastActivityAt < now - 1h
 *   - recovered = false
 *   - reminderCount < 3
 *   - has a contactable phone or email
 * …and sends the abandonedCart WhatsApp template.
 *
 * On successful order placement, the frontend marks the session
 * `recovered = true` and links the order via `recoveredOrderId`.
 */
export const CartSessions: CollectionConfig = {
  slug: 'cart-sessions',
  access: {
    // Public create/update so guests can sync. Tighten later via custom rules.
    read: anyone,
    create: anyone,
    update: anyone,
    delete: authenticated,
  },
  admin: {
    defaultColumns: ['sessionId', 'totalValue', 'lastActivityAt', 'reminderCount', 'recovered'],
    useAsTitle: 'sessionId',
    description: 'Server-side cart snapshots for abandoned-cart recovery.',
  },
  fields: [
    {
      name: 'sessionId',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Cookie-stored session id (UUID v4).' },
    },
    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'customers',
    },
    {
      name: 'guestPhone',
      type: 'text',
      admin: { description: 'Used when no customer is logged in but phone is captured at checkout.' },
    },
    {
      name: 'guestEmail',
      type: 'email',
    },
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products', required: true },
        { name: 'variantLabel', type: 'text' },
        { name: 'qty', type: 'number', required: true },
        { name: 'unitPrice', type: 'number', required: true },
      ],
    },
    {
      name: 'totalValue',
      type: 'number',
      admin: { description: 'Sum of unitPrice × qty across items.' },
    },
    {
      name: 'lastActivityAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'abandonedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Set by cron when session is first flagged as abandoned.' },
    },
    {
      name: 'reminderCount',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Number of recovery messages sent.' },
    },
    {
      name: 'lastReminderAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'recovered',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'recoveredOrderId',
      type: 'relationship',
      relationTo: 'orders',
    },
  ],
  timestamps: true,
}

import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { swargJwtStrategy } from '../../payload/strategies/jwtAuth'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: {
    // Custom JWT strategy bridges the Node.js admin JWT (set by /login as the
    // swarg_admin_token cookie) into Payload. Payload's local email/password
    // strategy stays enabled as a bootstrap fallback.
    strategies: [swargJwtStrategy],
    // Enables per-user API keys for server-to-server calls (e.g. the
    // swargnodejsbackend stock-sync helper). Generate a key in the admin
    // UI by editing a service-account user → "Enable API Key" → save →
    // copy the revealed key once. Header format: `users API-Key <token>`.
    useAPIKey: true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
  timestamps: true,
}

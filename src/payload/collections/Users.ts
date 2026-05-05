import type { CollectionConfig } from 'payload'
import { swargJwtStrategy } from '../strategies/jwtAuth'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    // Local email/password login stays enabled as a bootstrap fallback. Once
    // every operator has a Node.js admin account with the `payload_admin`
    // permission, this can be flipped to `disableLocalStrategy: true`.
    strategies: [swargJwtStrategy],
  },
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'editor',
      options: [
        { label: 'Super Admin', value: 'super_admin' },
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

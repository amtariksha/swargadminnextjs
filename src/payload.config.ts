import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

import { Pages } from './payload/collections/Pages'
import { Posts } from './payload/collections/Posts'
import { Media } from './payload/collections/Media'
import { Users } from './payload/collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' — Swarg CMS',
    },
  },
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
      ssl: { rejectUnauthorized: false },
    },
    // Set PAYLOAD_PUSH=true in Vercel to let drizzle-kit push the current
    // collection schema to Postgres on boot (default: dev only). Use as a
    // one-shot to sync missing columns; turn back off once stable and adopt
    // proper migrations via `payload migrate:create` for ongoing changes.
    push: process.env.PAYLOAD_PUSH === 'true',
  }),
  collections: [Pages, Posts, Media, Users],
  secret: process.env.PAYLOAD_SECRET || 'default-secret-change-me',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})

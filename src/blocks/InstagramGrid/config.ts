import type { Block } from 'payload'

/**
 * InstagramGrid — renders the latest curated tiles from the
 * `instagram-posts` collection (manual upload, zero API dependency).
 */
export const InstagramGrid: Block = {
  slug: 'instagramGrid',
  interfaceName: 'InstagramGridBlock',
  labels: { singular: 'Instagram Grid', plural: 'Instagram Grids' },
  fields: [
    { name: 'heading', type: 'text', defaultValue: 'From Our Kitchen & Farm' },
    {
      name: 'count',
      type: 'number',
      defaultValue: 6,
      admin: { description: 'How many tiles to show (6 or 9 look best).' },
    },
  ],
}

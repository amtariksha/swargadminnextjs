import type { Block } from 'payload'

/**
 * Video — performance-conscious YouTube embed (frontend renders a facade:
 * thumbnail + click-to-load iframe) with VideoObject JSON-LD for video SEO.
 */
export const Video: Block = {
  slug: 'video',
  interfaceName: 'VideoBlock',
  labels: { singular: 'Video', plural: 'Videos' },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'Shown above the player and used in VideoObject schema.' },
    },
    {
      name: 'youtubeId',
      type: 'text',
      required: true,
      admin: { description: 'The YouTube video id, e.g. dQw4w9WgXcQ (not the full URL).' },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'One or two sentences — used in VideoObject schema.' },
    },
    {
      name: 'poster',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Optional custom thumbnail; defaults to the YouTube thumbnail.' },
    },
    {
      name: 'duration',
      type: 'text',
      admin: { description: 'ISO 8601, e.g. PT1M30S for 1 min 30 s (for schema).', width: '50%' },
    },
    {
      name: 'uploadDate',
      type: 'date',
      admin: { width: '50%' },
    },
  ],
}

import type { Block } from 'payload'

/**
 * Timeline — chaptered heritage story (prose + photo per chapter with
 * milestone callouts). Deliberately narrative-first: no interactive
 * timeline widgets.
 */
export const Timeline: Block = {
  slug: 'timeline',
  interfaceName: 'TimelineBlock',
  labels: { singular: 'Timeline', plural: 'Timelines' },
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'chapters',
      type: 'array',
      minRows: 1,
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'yearRange',
          type: 'text',
          admin: { description: 'e.g. "2011 – 2014"', width: '40%' },
        },
        { name: 'body', type: 'richText' },
        { name: 'image', type: 'upload', relationTo: 'media' },
        {
          name: 'milestones',
          type: 'array',
          fields: [{ name: 'text', type: 'text', required: true }],
        },
      ],
    },
  ],
}

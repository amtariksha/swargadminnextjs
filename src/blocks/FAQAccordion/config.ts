import type { Block } from 'payload'

/**
 * FAQAccordion — page-builder block that renders an accordion of FAQs.
 * Either pulls dynamically from the FAQs collection by category, or accepts
 * inline question/answer pairs (overrides the collection lookup).
 */
export const FAQAccordion: Block = {
  slug: 'faqAccordion',
  interfaceName: 'FAQAccordionBlock',
  labels: { singular: 'FAQ Accordion', plural: 'FAQ Accordions' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: { description: 'Section heading shown above the accordion.' },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'collection',
      options: [
        { label: 'From FAQs collection (filtered)', value: 'collection' },
        { label: 'Inline questions/answers', value: 'inline' },
      ],
      admin: { width: '50%' },
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'General', value: 'general' },
        { label: 'Product', value: 'product' },
        { label: 'Shipping', value: 'shipping' },
        { label: 'Payment', value: 'payment' },
        { label: 'Refund / Return', value: 'refund' },
        { label: 'Account', value: 'account' },
      ],
      admin: {
        condition: (_, siblingData) => siblingData?.source === 'collection',
        description: 'Filter by FAQ category.',
        width: '50%',
      },
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 10,
      admin: {
        condition: (_, siblingData) => siblingData?.source === 'collection',
        description: 'Maximum number of FAQs to show.',
      },
    },
    {
      name: 'inlineItems',
      type: 'array',
      admin: { condition: (_, siblingData) => siblingData?.source === 'inline' },
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'richText', required: true },
      ],
    },
  ],
}

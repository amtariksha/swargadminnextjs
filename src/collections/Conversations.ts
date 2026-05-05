import type { CollectionConfig } from 'payload'

export const Conversations: CollectionConfig = {
  slug: 'conversations',
  labels: { singular: 'Conversation', plural: 'Conversations' },
  admin: {
    defaultColumns: ['waId', 'customer', 'status', 'lastMessageAt'],
    group: 'Communication',
  },
  fields: [
    {
      name: 'waId',
      type: 'text',
      unique: true,
      required: true,
      admin: { description: 'WhatsApp ID (phone number)' },
    },
    { name: 'customer', type: 'relationship', relationTo: 'customers' },
    {
      name: 'messages',
      type: 'array',
      fields: [
        {
          name: 'direction',
          type: 'select',
          required: true,
          options: [
            { label: 'Incoming', value: 'incoming' },
            { label: 'Outgoing', value: 'outgoing' },
          ],
        },
        {
          name: 'type',
          type: 'select',
          defaultValue: 'text',
          options: [
            { label: 'Text', value: 'text' },
            { label: 'Template', value: 'template' },
            { label: 'Image', value: 'image' },
            { label: 'Document', value: 'document' },
          ],
        },
        { name: 'content', type: 'textarea', required: true },
        { name: 'templateName', type: 'text' },
        { name: 'timestamp', type: 'date', required: true },
        {
          name: 'deliveryStatus',
          type: 'select',
          options: [
            { label: 'Sent', value: 'sent' },
            { label: 'Delivered', value: 'delivered' },
            { label: 'Read', value: 'read' },
            { label: 'Failed', value: 'failed' },
          ],
        },
        { name: 'staffMember', type: 'text' },
      ],
    },
    { name: 'lastMessageAt', type: 'date' },
    { name: 'unreadCount', type: 'number', defaultValue: 0 },
    { name: 'assignedTo', type: 'relationship', relationTo: 'users' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Resolved', value: 'resolved' },
        { label: 'Waiting', value: 'waiting' },
      ],
      admin: { position: 'sidebar' },
    },
  ],
  timestamps: true,
}

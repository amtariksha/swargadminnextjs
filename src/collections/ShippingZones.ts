import type { CollectionConfig } from 'payload'

export const ShippingZones: CollectionConfig = {
  slug: 'shipping-zones',
  labels: { singular: 'Shipping Zone', plural: 'Shipping Zones' },
  admin: {
    useAsTitle: 'zoneName',
    group: 'Commerce',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'zoneName',
      type: 'text',
      required: true,
      admin: { description: 'e.g. "Bangalore Extended", "South India"' },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Pincode List', value: 'pincode_list' },
        { label: 'Pincode Range', value: 'pincode_range' },
        { label: 'State List', value: 'state_list' },
        { label: 'All India', value: 'all_india' },
      ],
    },
    {
      name: 'pincodes',
      type: 'array',
      admin: { condition: (data) => data?.type === 'pincode_list' },
      fields: [{ name: 'pincode', type: 'text', required: true }],
    },
    {
      name: 'pincodeFrom',
      type: 'text',
      admin: { condition: (data) => data?.type === 'pincode_range' },
    },
    {
      name: 'pincodeTo',
      type: 'text',
      admin: { condition: (data) => data?.type === 'pincode_range' },
    },
    {
      name: 'states',
      type: 'array',
      admin: { condition: (data) => data?.type === 'state_list' },
      fields: [{ name: 'state', type: 'text', required: true }],
    },
    {
      name: 'shippingMethods',
      type: 'array',
      required: true,
      fields: [
        { name: 'methodName', type: 'text', required: true },
        {
          name: 'calculationType',
          type: 'select',
          required: true,
          options: [
            { label: 'Internal Delivery (Swarg fleet)', value: 'internal_delivery' },
            { label: 'Flat Rate', value: 'flat_rate' },
            { label: 'Weight Based', value: 'weight_based' },
            { label: 'Free Above Threshold', value: 'free_above_threshold' },
          ],
        },
        { name: 'flatRate', type: 'number' },
        { name: 'ratePerKg', type: 'number' },
        {
          name: 'baseWeight',
          type: 'number',
          admin: { description: 'Included weight in grams (e.g. first 500g free)' },
        },
        {
          name: 'freeAbove',
          type: 'number',
          admin: { description: 'Order total above which shipping is free' },
        },
        {
          name: 'estimatedDays',
          type: 'text',
          admin: { description: 'e.g. "Same day", "2-3 business days"' },
        },
        { name: 'active', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      name: 'availablePaymentMethods',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Razorpay (cards / UPI / wallets)', value: 'razorpay' },
        { label: 'Cash on Delivery', value: 'cod' },
        { label: 'UPI (direct)', value: 'upi' },
      ],
      admin: {
        description: 'Payment methods allowed for orders shipping to this zone. Empty = all methods allowed.',
      },
    },
    { name: 'isActive', type: 'checkbox', defaultValue: true },
  ],
}

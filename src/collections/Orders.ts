import type { CollectionConfig } from 'payload'

export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: 'Order', plural: 'Orders' },
  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'status', 'total', 'paymentMethod', 'createdAt'],
    group: 'Commerce',
  },
  access: {
    read: () => true, // TODO: restrict to admin + order owner
  },
  fields: [
    {
      name: 'orderNumber',
      type: 'text',
      unique: true,
      required: true,
      admin: { readOnly: true },
    },
    { name: 'customer', type: 'relationship', relationTo: 'customers' },

    // Guest checkout fields
    { name: 'guestName', type: 'text' },
    { name: 'guestPhone', type: 'text' },
    { name: 'guestEmail', type: 'email' },

    // Line items
    {
      name: 'items',
      type: 'array',
      required: true,
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products', required: true },
        { name: 'variantLabel', type: 'text' },
        { name: 'quantity', type: 'number', required: true, min: 1 },
        { name: 'unitPrice', type: 'number', required: true },
        { name: 'lineTotal', type: 'number', required: true },
        { name: 'hsnCode', type: 'text' },
        { name: 'taxAmount', type: 'number', defaultValue: 0 },
      ],
    },

    // Totals
    { name: 'subtotal', type: 'number', required: true },
    {
      name: 'taxBreakdown',
      type: 'group',
      fields: [
        { name: 'cgst', type: 'number', defaultValue: 0 },
        { name: 'sgst', type: 'number', defaultValue: 0 },
        { name: 'igst', type: 'number', defaultValue: 0 },
        { name: 'totalTax', type: 'number', defaultValue: 0 },
      ],
    },
    { name: 'estimatedShipping', type: 'number', defaultValue: 0 },
    {
      name: 'actualShipping',
      type: 'number',
      admin: { description: 'Actual courier cost (staff fills post-packing)' },
    },
    {
      name: 'shippingAdjustment',
      type: 'number',
      admin: { description: 'actualShipping - estimatedShipping (if positive)' },
    },
    { name: 'shippingAdjustmentPaid', type: 'checkbox', defaultValue: false },
    { name: 'shippingAdjustmentPaymentLink', type: 'text' },
    { name: 'discount', type: 'number', defaultValue: 0 },
    { name: 'couponCode', type: 'text' },
    {
      name: 'total',
      type: 'number',
      required: true,
      admin: { description: 'Final total at checkout' },
    },
    {
      name: 'finalTotal',
      type: 'number',
      admin: { description: 'total + shippingAdjustment' },
    },

    // Status
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Pending Shipping Payment', value: 'pending_shipping_payment' },
        { label: 'Processing', value: 'processing' },
        { label: 'Shipped', value: 'shipped' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Refunded', value: 'refunded' },
        { label: 'Legacy Archived', value: 'legacy_archived' },
      ],
      admin: { position: 'sidebar' },
    },

    // Payment
    {
      name: 'paymentMethod',
      type: 'select',
      options: [
        { label: 'Razorpay', value: 'razorpay' },
        { label: 'Cash on Delivery', value: 'cod' },
        { label: 'Payment Link', value: 'payment_link' },
      ],
    },
    {
      name: 'paymentStatus',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Paid', value: 'paid' },
        { label: 'Failed', value: 'failed' },
        { label: 'Refunded', value: 'refunded' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'razorpayOrderId', type: 'text' },
    { name: 'razorpayPaymentId', type: 'text' },

    // Delivery
    {
      name: 'deliveryAddress',
      type: 'group',
      fields: [
        { name: 'name', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'line1', type: 'text' },
        { name: 'line2', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'state', type: 'text' },
        { name: 'pincode', type: 'text' },
      ],
    },
    { name: 'shippingZone', type: 'text' },
    { name: 'shippingMethod', type: 'text' },
    { name: 'trackingNumber', type: 'text' },
    { name: 'trackingUrl', type: 'text' },

    // Notes
    { name: 'notes', type: 'textarea', admin: { description: 'Customer notes' } },
    { name: 'internalNotes', type: 'textarea', admin: { description: 'Staff-only notes' } },
    { name: 'invoiceUrl', type: 'text' },

    // Legacy
    { name: 'legacyWpId', type: 'number', admin: { position: 'sidebar' } },
    { name: 'isLegacy', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar' } },
  ],
  timestamps: true,
}

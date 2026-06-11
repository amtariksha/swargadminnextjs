import type { CollectionConfig } from 'payload'

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: 'Product', plural: 'Products' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'price', 'stockQty', 'shippability', 'platformVisibility', 'inStock'],
    group: 'Commerce',
    // Managed in the custom ops admin (/products → node). Hidden from the Payload
    // nav to declutter Commerce; still registered so relationships, the REST API,
    // and storefront reads keep working. Reachable by direct URL if ever needed.
    hidden: true,
  },
  access: {
    read: () => true, // Public read for storefront
  },
  fields: [
    // Sync fields (from MySQL)
    {
      name: 'mysqlProductId',
      type: 'number',
      unique: true,
      index: true,
      admin: { description: 'ID from Swarg MySQL database. Null for web-only products.' },
    },
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', unique: true, required: true, admin: { position: 'sidebar' } },
    {
      name: 'shortDescription',
      type: 'textarea',
      admin: { description: 'One-liner for product cards' },
    },
    { name: 'description', type: 'richText', admin: { description: 'Full product description' } },
    {
      name: 'price',
      type: 'number',
      required: true,
      min: 0,
      admin: { description: 'Selling price in INR' },
    },
    {
      name: 'mrp',
      type: 'number',
      min: 0,
      admin: { description: 'Maximum retail price (for showing discount)' },
    },
    {
      name: 'salePrice',
      type: 'number',
      min: 0,
      admin: { description: 'Sale price (if on sale, lower than price)' },
    },
    { name: 'sku', type: 'text' },
    { name: 'tax', type: 'number', admin: { description: 'Tax percentage from MySQL' } },
    { name: 'qtyText', type: 'text', admin: { description: 'Display text e.g. "500ml", "1kg"' } },
    { name: 'offerText', type: 'text' },
    { name: 'disclaimer', type: 'textarea' },
    {
      name: 'subscription',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Is this a subscription product in the app?' },
    },

    // Stock
    { name: 'stockQty', type: 'number', defaultValue: 0 },
    { name: 'lowStockThreshold', type: 'number', defaultValue: 5 },
    { name: 'inStock', type: 'checkbox', defaultValue: true },
    {
      name: 'stockStatus',
      type: 'select',
      defaultValue: 'in_stock',
      options: [
        { label: 'In Stock', value: 'in_stock' },
        { label: 'Low Stock', value: 'low_stock' },
        { label: 'Out of Stock', value: 'out_of_stock' },
      ],
    },

    // Relationships
    { name: 'category', type: 'relationship', relationTo: 'categories' },
    { name: 'subcategory', type: 'relationship', relationTo: 'sub-categories' },

    // Images
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    {
      name: 'gallery',
      type: 'array',
      fields: [{ name: 'image', type: 'upload', relationTo: 'media', required: true }],
    },

    // Variants
    {
      name: 'variants',
      type: 'array',
      admin: { description: 'Product variants (e.g. 200ml, 500ml, 1L)' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'sku', type: 'text' },
        { name: 'price', type: 'number', required: true },
        { name: 'mrp', type: 'number' },
        { name: 'weight', type: 'number', admin: { description: 'Weight in grams' } },
        { name: 'stockQty', type: 'number', defaultValue: 0 },
      ],
    },

    // Web-only enrichment fields
    {
      name: 'longDescription',
      type: 'richText',
      admin: { description: 'Extended web description (not synced to MySQL)' },
    },
    { name: 'ingredients', type: 'richText' },
    {
      name: 'nutritionInfo',
      type: 'group',
      fields: [
        { name: 'servingSize', type: 'text' },
        { name: 'calories', type: 'number' },
        { name: 'protein', type: 'number' },
        { name: 'fat', type: 'number' },
        { name: 'carbs', type: 'number' },
        { name: 'fiber', type: 'number' },
      ],
    },

    // Geo-filtering & platform visibility
    {
      name: 'shippability',
      type: 'select',
      required: true,
      defaultValue: 'all_india',
      options: [
        { label: 'Bangalore Only (perishable)', value: 'bangalore_only' },
        { label: 'Bangalore Extended (courier)', value: 'bangalore_extended' },
        { label: 'All India (shippable)', value: 'all_india' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Which zones can see this product on the website',
      },
    },
    {
      name: 'platformVisibility',
      type: 'select',
      required: true,
      defaultValue: 'both',
      options: [
        { label: 'Both (App + Web)', value: 'both' },
        { label: 'Web Only', value: 'web_only' },
        { label: 'App Only (hidden on web)', value: 'app_only' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'requiresColdChain',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },

    // Taxonomy
    { name: 'featured', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar' } },
    {
      name: 'badgeText',
      type: 'text',
      admin: { position: 'sidebar', description: 'e.g. "New", "Bestseller"' },
    },
    {
      name: 'tags',
      type: 'array',
      fields: [{ name: 'tag', type: 'text', required: true }],
    },
    { name: 'relatedProducts', type: 'relationship', relationTo: 'products', hasMany: true },

    // Tax & Shipping
    { name: 'taxRate', type: 'relationship', relationTo: 'tax-rates' },
    { name: 'shippingClass', type: 'relationship', relationTo: 'shipping-classes' },
    { name: 'weight', type: 'number', admin: { description: 'Weight in grams (for shipping calc)' } },
    { name: 'displayWeight', type: 'text', admin: { description: 'Display text e.g. "250gms"' } },

    // Sync tracking
    { name: 'lastSyncedAt', type: 'date', admin: { position: 'sidebar', readOnly: true } },
    { name: 'isActive', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    { name: 'publishedDate', type: 'date', admin: { position: 'sidebar' } },
    { name: 'wpId', type: 'text', index: true, admin: { hidden: true, description: 'Legacy WordPress / WooCommerce product ID for migration idempotency.' } },
  ],
}

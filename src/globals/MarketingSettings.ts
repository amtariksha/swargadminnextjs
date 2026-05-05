import type { GlobalConfig } from 'payload'

export const MarketingSettings: GlobalConfig = {
  slug: 'marketing-settings',
  label: 'Marketing Settings',
  admin: {
    group: 'Settings',
  },
  fields: [
    // Google Analytics 4
    {
      name: 'googleAnalytics',
      type: 'group',
      label: 'Google Analytics',
      fields: [
        { name: 'measurementId', type: 'text', admin: { description: 'G-XXXXXXXXX' } },
        { name: 'enabled', type: 'checkbox', defaultValue: false },
      ],
    },

    // Google Ads
    {
      name: 'googleAds',
      type: 'group',
      label: 'Google Ads',
      fields: [
        { name: 'conversionId', type: 'text', admin: { description: 'AW-XXXXXXXXX' } },
        { name: 'conversionLabel', type: 'text' },
        { name: 'merchantCenterId', type: 'text' },
        { name: 'enabled', type: 'checkbox', defaultValue: false },
      ],
    },

    // Meta / Facebook
    {
      name: 'meta',
      type: 'group',
      label: 'Meta / Facebook',
      fields: [
        { name: 'pixelId', type: 'text' },
        { name: 'conversionsApiToken', type: 'text', admin: { description: 'Server-side access token for Conversions API' } },
        { name: 'testEventCode', type: 'text', admin: { description: 'For sandbox testing' } },
        { name: 'enabled', type: 'checkbox', defaultValue: false },
      ],
    },

    // WhatsApp Business API
    {
      name: 'whatsapp',
      type: 'group',
      label: 'WhatsApp Business',
      fields: [
        { name: 'phoneNumberId', type: 'text', admin: { description: 'Meta Cloud API Phone Number ID' } },
        { name: 'wabaId', type: 'text', admin: { description: 'WhatsApp Business Account ID' } },
        { name: 'accessToken', type: 'text', admin: { description: 'System User permanent access token' } },
        { name: 'webhookVerifyToken', type: 'text' },
        { name: 'defaultMessage', type: 'text', defaultValue: 'Hi! I\'d like to know more about Swarg Food products.' },
        {
          name: 'templateIds',
          type: 'group',
          fields: [
            { name: 'orderConfirmation', type: 'text', defaultValue: 'order_confirmation' },
            { name: 'orderShipped', type: 'text', defaultValue: 'order_shipped' },
            { name: 'orderDelivered', type: 'text', defaultValue: 'order_delivered' },
            { name: 'shippingAdjustment', type: 'text', defaultValue: 'shipping_adjustment' },
            { name: 'abandonedCart', type: 'text', defaultValue: 'abandoned_cart' },
            { name: 'otpVerification', type: 'text', defaultValue: 'otp_verification' },
          ],
        },
      ],
    },
  ],
}

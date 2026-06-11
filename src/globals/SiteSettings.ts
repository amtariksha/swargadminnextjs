import type { GlobalConfig } from 'payload'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site Settings',
  admin: {
    group: 'Settings',
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'brandName', type: 'text', defaultValue: 'Swarg Food' },
    { name: 'tagline', type: 'text', defaultValue: 'Pure. Traditional. Healthy.' },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'favicon', type: 'upload', relationTo: 'media' },
    { name: 'contactEmail', type: 'email', defaultValue: 'contact@swargfood.com' },
    { name: 'contactPhone', type: 'text', defaultValue: '+91-7996196111' },
    { name: 'whatsappNumber', type: 'text', defaultValue: '917996196111' },
    { name: 'registeredAddress', type: 'textarea', defaultValue: 'Survey no 29, 2nd block, Vaddarapalya, JP Nagar 8th Phase, Gottigere, Bengaluru – 560083' },
    {
      name: 'socialLinks',
      type: 'array',
      fields: [
        {
          name: 'platform',
          type: 'select',
          required: true,
          options: [
            { label: 'Facebook', value: 'facebook' },
            { label: 'Instagram', value: 'instagram' },
            { label: 'YouTube', value: 'youtube' },
            { label: 'Twitter/X', value: 'twitter' },
            { label: 'LinkedIn', value: 'linkedin' },
          ],
        },
        { name: 'url', type: 'text', required: true },
      ],
    },
    {
      name: 'announcementBar',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'text', type: 'text' },
        { name: 'link', type: 'text' },
        { name: 'backgroundColor', type: 'text', defaultValue: '#2E4928' },
      ],
    },
    {
      name: 'defaultSEO',
      type: 'group',
      fields: [
        { name: 'metaTitle', type: 'text', defaultValue: 'Swarg Food — A2 Desi Cow Milk, Full Moon Ghee & Healthy Food' },
        { name: 'metaDescription', type: 'textarea', defaultValue: 'Order A2 desi cow milk, full moon ghee, sugar-free sweets, organic snacks & more from Swarg Food. 15+ years of pure, traditional, healthy food from Bangalore.' },
        { name: 'ogImage', type: 'upload', relationTo: 'media' },
      ],
    },
    {
      name: 'businessHours',
      type: 'text',
      defaultValue: '10:00 AM – 7:00 PM',
    },
  ],
}

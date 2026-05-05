import type { GlobalConfig } from 'payload'

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Navigation',
  admin: {
    group: 'Settings',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'mainMenu',
      type: 'array',
      label: 'Main Menu',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'link', type: 'text', required: true },
        {
          name: 'children',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'link', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'footerSections',
      type: 'array',
      label: 'Footer Sections',
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'links',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'link', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'mobileBottomBar',
      type: 'array',
      label: 'Mobile Bottom Bar',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'icon', type: 'text', required: true, admin: { description: 'Lucide icon name e.g. "home", "shopping-bag"' } },
        { name: 'link', type: 'text', required: true },
      ],
    },
  ],
}

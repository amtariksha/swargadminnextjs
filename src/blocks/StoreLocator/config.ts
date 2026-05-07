import type { Block } from 'payload'

/**
 * StoreLocator — page-builder block that pulls active StoreLocations and
 * renders them as a list with optional Google Map embeds.
 */
export const StoreLocator: Block = {
  slug: 'storeLocator',
  interfaceName: 'StoreLocatorBlock',
  labels: { singular: 'Store Locator', plural: 'Store Locators' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: { description: 'Section heading.' },
    },
    {
      name: 'introText',
      type: 'richText',
    },
    {
      name: 'showMap',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Render the Google Map embed for each location with mapEmbedUrl set.' },
    },
    {
      name: 'showHours',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
}

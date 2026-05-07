import type { Block } from 'payload'

/**
 * TeamGrid — page-builder block that pulls active TeamMembers (ordered by
 * displayOrder) and renders them as a responsive grid.
 */
export const TeamGrid: Block = {
  slug: 'teamGrid',
  interfaceName: 'TeamGridBlock',
  labels: { singular: 'Team Grid', plural: 'Team Grids' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: { description: 'Section heading.' },
    },
    {
      name: 'subheading',
      type: 'text',
    },
    {
      name: 'columns',
      type: 'select',
      defaultValue: '3',
      options: [
        { label: '2 columns', value: '2' },
        { label: '3 columns', value: '3' },
        { label: '4 columns', value: '4' },
      ],
    },
    {
      name: 'showSocials',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Render social icons when set on a team member.' },
    },
  ],
}

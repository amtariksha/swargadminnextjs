import type { CollectionConfig } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { authenticated } from '../access/authenticated'
import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { generatePreviewPath } from '../utilities/generatePreviewPath'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { slugField } from 'payload'

export const Recipes: CollectionConfig = {
  slug: 'recipes',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
    heroImage: true,
    meta: { image: true, description: true },
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug as string,
          collection: 'recipes' as never,
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'recipes' as never,
        req,
      }),
    useAsTitle: 'title',
    description: 'Food recipes for content marketing — links to products used as ingredients.',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Recipe',
          fields: [
            { name: 'heroImage', type: 'upload', relationTo: 'media' },
            { name: 'summary', type: 'textarea', admin: { description: 'Short blurb for cards / SEO.' } },
            {
              name: 'prepTime',
              type: 'number',
              admin: { description: 'Minutes', width: '33%' },
            },
            {
              name: 'cookTime',
              type: 'number',
              admin: { description: 'Minutes', width: '33%' },
            },
            {
              name: 'servings',
              type: 'number',
              admin: { description: 'Servings', width: '33%' },
            },
            {
              name: 'ingredients',
              type: 'array',
              required: true,
              fields: [
                { name: 'item', type: 'text', required: true },
                { name: 'qty', type: 'text', admin: { description: 'e.g. "200", "1/2"', width: '30%' } },
                { name: 'unit', type: 'text', admin: { description: 'e.g. "g", "tsp"', width: '30%' } },
                {
                  name: 'product',
                  type: 'relationship',
                  relationTo: 'products',
                  admin: { description: 'Optional — link to a Swarg product.' },
                },
              ],
            },
            {
              name: 'instructions',
              type: 'array',
              required: true,
              fields: [
                {
                  name: 'text',
                  type: 'richText',
                  editor: lexicalEditor({
                    features: ({ rootFeatures }) => [
                      ...rootFeatures,
                      HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
                      FixedToolbarFeature(),
                      InlineToolbarFeature(),
                      HorizontalRuleFeature(),
                    ],
                  }),
                  required: true,
                },
              ],
            },
          ],
        },
        {
          label: 'Meta',
          fields: [
            {
              name: 'relatedProducts',
              type: 'relationship',
              relationTo: 'products',
              hasMany: true,
              admin: { description: 'Products to cross-sell on the recipe page.' },
            },
            {
              name: 'categories',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
            },
            {
              name: 'tags',
              type: 'relationship',
              relationTo: 'tags' as never,
              hasMany: true,
            },
            {
              name: 'authors',
              type: 'relationship',
              relationTo: 'users',
              hasMany: true,
            },
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({ hasGenerateFn: true }),
            MetaImageField({ relationTo: 'media' }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' }, position: 'sidebar' },
    },
    slugField(),
    {
      name: 'wpId',
      type: 'text',
      index: true,
      admin: { hidden: true, description: 'Legacy WordPress ID for migration idempotency.' },
    },
  ],
  versions: {
    drafts: {
      autosave: { interval: 100 },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
  timestamps: true,
}

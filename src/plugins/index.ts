import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { s3Storage } from '@payloadcms/storage-s3'
import { Plugin } from 'payload'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'

import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Website Template` : 'Payload Website Template'
}

const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      // @ts-expect-error - This is a valid override, mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description: 'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
    generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formOverrides: {
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
  }),
  searchPlugin({
    collections: ['posts'],
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
    },
  }),
  // Cloudflare R2 (S3-compatible) storage for the Media collection.
  // Required because Vercel's serverless filesystem is read-only —
  // Payload's default disk-staticDir adapter throws 500 on every upload.
  // When the R2 env vars are unset (local dev) the plugin disables itself
  // and Payload falls back to the disk adapter, which works locally.
  //
  // The R2 bucket is **shared** with the swargnodejsbackend (Feature 07
  // pickup-proof photos etc.). To keep Payload media isolated from
  // backend uploads in the same bucket, every object is prefixed with
  // R2_MEDIA_PREFIX (default 'payload/'). Override the prefix via
  // env to point at a different folder.
  //
  // Create / reuse an R2 API token in the Cloudflare dashboard
  // (R2 → Manage R2 API Tokens → Object Read & Write on the bucket).
  s3Storage({
    enabled: Boolean(
      process.env.R2_BUCKET &&
        process.env.R2_ENDPOINT &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY,
    ),
    collections: {
      media: {
        prefix: process.env.R2_MEDIA_PREFIX || 'payload',
        // Bypass Payload's static-file handler entirely. With this flag the
        // afterRead hook calls the adapter's generateURL OR our custom
        // generateFileURL — never `/api/media/file/{filename}` (which would
        // stream every read through the Vercel function and consume the
        // Hobby-tier function bandwidth quota).
        disablePayloadAccessControl: true,
        // Resolve each Media doc's `url` to the R2 *public* URL so the
        // browser fetches the bytes directly from Cloudflare. R2_PUBLIC_URL
        // is the bucket's public dev/CDN URL (e.g.
        // https://pub-7b1b9fa756b54ffea517a9b116a1af2b.r2.dev). When unset,
        // we fall back to the S3-API endpoint (which works for buckets that
        // allow unauthenticated GETs on the endpoint hostname — most R2
        // setups do not, so prefer setting R2_PUBLIC_URL).
        generateFileURL: ({ filename, prefix }: { filename: string; prefix?: string }) => {
          const publicBase = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')
          const effectivePrefix = prefix || process.env.R2_MEDIA_PREFIX || 'payload'
          const path = `${effectivePrefix}/${filename}`.replace(/\/+/g, '/')
          if (publicBase) return `${publicBase}/${path}`
          // Fallback: signed-ish S3 path. Not ideal — only works if the
          // bucket policy allows unauthenticated GETs on the endpoint.
          return `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}/${path}`
        },
      },
    },
    bucket: process.env.R2_BUCKET ?? '',
    config: {
      endpoint: process.env.R2_ENDPOINT,
      // R2 is region-agnostic — the AWS SDK requires *some* region, so use 'auto'.
      region: 'auto',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    },
  }),
]

/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* (Lightly modified to log Server Component errors with full details
 *  before React masks them for production. Remove the wrapper once the
 *  /admin render issue is diagnosed and fixed.) */
import type { Metadata } from 'next'

import config from '@payload-config'
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import { importMap } from '../importMap'

type Args = {
  params: Promise<{
    segments: string[]
  }>
  searchParams: Promise<{
    [key: string]: string | string[]
  }>
}

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })

const Page = async ({ params, searchParams }: Args) => {
  try {
    return await RootPage({ config, params, searchParams, importMap })
  } catch (err) {
    const e = err as Error & { digest?: string; cause?: unknown }
    console.error('[payload-admin] RootPage threw:', {
      name: e?.name,
      message: e?.message,
      digest: e?.digest,
      cause: e?.cause,
      stack: e?.stack,
    })
    throw err
  }
}

export default Page

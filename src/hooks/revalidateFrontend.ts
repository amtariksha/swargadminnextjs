import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * The marketing site (swargfood.com) is a SEPARATE Next.js deployment —
 * next/cache revalidatePath() here only touches the admin app. These hooks
 * notify the frontend's /api/revalidate endpoint over HTTP; that endpoint
 * revalidates its own cache and pings IndexNow for fast Bing/ChatGPT
 * discovery.
 *
 * Env (admin side):
 *   FRONTEND_REVALIDATE_URL    e.g. https://swargfood.com/api/revalidate
 *   FRONTEND_REVALIDATE_SECRET shared secret, must match the frontend
 *
 * Fire-and-forget with a short timeout — a slow/missing frontend must never
 * block a CMS save.
 */
function notifyFrontend(paths: string[], logger?: { warn: (msg: string) => void }): void {
  const url = process.env.FRONTEND_REVALIDATE_URL
  const secret = process.env.FRONTEND_REVALIDATE_SECRET
  if (!url || !secret) return

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ paths }),
    signal: AbortSignal.timeout(5000),
  }).catch((error: unknown) => {
    logger?.warn(
      `revalidateFrontend: could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`,
    )
  })
}

/**
 * afterChange hook factory. `basePath` is the frontend route this collection
 * powers; docs with a slug also revalidate `${basePath}/${slug}`.
 */
export function revalidateFrontend(basePath: string): CollectionAfterChangeHook {
  return ({ doc, req }) => {
    const paths = [basePath]
    const slug = (doc as { slug?: string }).slug
    if (slug && basePath !== '/') paths.push(`${basePath}/${slug}`)
    notifyFrontend(paths, req.payload.logger)
    return doc
  }
}

export function revalidateFrontendDelete(basePath: string): CollectionAfterDeleteHook {
  return ({ doc, req }) => {
    const paths = [basePath]
    const slug = (doc as { slug?: string })?.slug
    if (slug && basePath !== '/') paths.push(`${basePath}/${slug}`)
    notifyFrontend(paths, req.payload.logger)
    return doc
  }
}

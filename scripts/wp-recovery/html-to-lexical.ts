/**
 * WP block-HTML → Payload Lexical converter (WS-1 content recovery).
 *
 * The legacy WP→Payload import dumped raw `post_content` (Gutenberg + Flatsome
 * UX-Builder shortcodes) into a single Lexical text node, so it renders as
 * escaped text. This converts that HTML into a real Lexical editor state that
 * the swargfooddotcom RichText renderer understands.
 *
 * Emits ONLY node types the frontend renderer (swargfooddotcom
 * src/components/RichText) handles AND the Posts/Pages editors accept:
 *   paragraph · heading(h1-h4) · list/listitem · text(bold/italic/underline)
 *   · link · horizontalrule · quote · block(mediaBlock for images)
 *
 * Images: Flatsome `[ux_image id="N"]` shortcodes carry WP attachment IDs.
 * They are turned into `<img data-wpid="N">` markers, then resolved by the
 * caller (`resolveImage`) to a Payload media id and emitted as MediaBlock nodes.
 */

import { parseDocument } from 'htmlparser2'

/** Minimal structural view of the htmlparser2/domhandler node tree. */
interface DomNode {
  type: string
  name?: string
  data?: string
  attribs?: Record<string, string>
  children?: DomNode[]
}

// Lexical text-format bitmask (matches the frontend renderer constants).
const FMT_BOLD = 1
const FMT_ITALIC = 2
const FMT_UNDERLINE = 8

export type LexNode = Record<string, unknown>

export interface ConvertResult {
  root: { root: LexNode }
  /** WP attachment ids referenced via [ux_image], in document order (deduped). */
  imageWpIds: number[]
}

/** Caller resolves a WP attachment id → Payload media doc id (or null to skip). */
export type ImageResolver = (wpAttachmentId: number) => string | number | null

function textNode(text: string, format: number): LexNode {
  return { type: 'text', text, format, style: '', mode: 'normal', detail: 0, version: 1 }
}

function elementNode(type: string, children: LexNode[], extra: Record<string, unknown> = {}): LexNode {
  return { type, format: '', indent: 0, version: 1, direction: 'ltr', children, ...extra }
}

const tag = (n: DomNode): string => (n.name || '').toLowerCase()
const kids = (n: DomNode): DomNode[] => n.children || []

// ---------------------------------------------------------------------------
// Pre-processing: strip wp: comments, flatsome shortcodes, document wrappers.
// ---------------------------------------------------------------------------
export function preprocess(raw: string): string {
  let html = raw
  // HTML comments (incl. <!-- wp:... -->).
  html = html.replace(/<!--[\s\S]*?-->/g, '')
  // Full-document wrappers some pages embedded (privacy-policy was a raw doc).
  html = html.replace(/<!doctype[^>]*>/gi, '')
  html = html.replace(/<\/?(html|body)[^>]*>/gi, '')
  html = html.replace(/<head[\s\S]*?<\/head>/gi, '')
  html = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
  html = html.replace(/<meta[^>]*>/gi, '')
  // Flatsome [ux_image id="N" ...] → marker the parser turns into a block.
  html = html.replace(/\[ux_image[^\]]*\bid="?(\d+)"?[^\]]*\]/gi, '<img data-wpid="$1" />')
  // Any other square-bracket shortcode tag ([row], [col …], [/ux_text], …)
  // → drop the TAG but keep inner content.
  html = html.replace(/\[\/?[a-z0-9_]+(?:[^\]]*)\]/gi, '')
  return html
}

// ---------------------------------------------------------------------------
// Inline content: text + strong/em/u/a → text nodes (w/ format) and link nodes.
// ---------------------------------------------------------------------------
const collapseWs = (s: string): string => s.replace(/\s+/g, ' ')

function inlineChildren(nodes: DomNode[], format: number): LexNode[] {
  const out: LexNode[] = []
  for (const n of nodes) {
    if (n.type === 'text') {
      const t = collapseWs(n.data || '')
      if (t) out.push(textNode(t, format))
      continue
    }
    if (n.type !== 'tag') continue
    switch (tag(n)) {
      case 'strong':
      case 'b':
        out.push(...inlineChildren(kids(n), format | FMT_BOLD))
        break
      case 'em':
      case 'i':
        out.push(...inlineChildren(kids(n), format | FMT_ITALIC))
        break
      case 'u':
        out.push(...inlineChildren(kids(n), format | FMT_UNDERLINE))
        break
      case 'br':
        out.push({ type: 'linebreak', version: 1 })
        break
      case 'a': {
        const url = n.attribs?.href || '#'
        out.push(
          elementNode('link', inlineChildren(kids(n), format), {
            fields: { linkType: 'custom', url, newTab: /^https?:\/\//i.test(url) },
          }),
        )
        break
      }
      default:
        // Unknown / pass-through inline tag → flatten its text.
        out.push(...inlineChildren(kids(n), format))
    }
  }
  return out
}

function isBlank(children: LexNode[]): boolean {
  return children.every(
    (c) => c.type === 'text' && !String((c as { text?: string }).text || '').trim(),
  )
}

// ---------------------------------------------------------------------------
// Block-level walk → top-level Lexical nodes (with image lifting).
// ---------------------------------------------------------------------------
function headingTag(name: string): string {
  // Editor supports h1-h4; clamp h5/h6 → h4.
  const n = Math.min(4, Math.max(1, parseInt(name.slice(1), 10) || 2))
  return `h${n}`
}

function listNode(el: DomNode): LexNode {
  const numbered = tag(el) === 'ol'
  const items: LexNode[] = []
  let value = 1
  for (const li of kids(el)) {
    if (li.type !== 'tag' || tag(li) !== 'li') continue
    const inline: DomNode[] = []
    const nested: LexNode[] = []
    for (const c of kids(li)) {
      if (c.type === 'tag' && (tag(c) === 'ul' || tag(c) === 'ol')) nested.push(listNode(c))
      else inline.push(c)
    }
    items.push(elementNode('listitem', [...inlineChildren(inline, 0), ...nested], { value: value++ }))
  }
  return elementNode('list', items, {
    listType: numbered ? 'number' : 'bullet',
    tag: numbered ? 'ol' : 'ul',
    start: 1,
  })
}

const WRAPPERS = ['div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'table', 'tbody', 'thead', 'tr', 'td', 'th']

function walkBlocks(nodes: DomNode[], resolveImage: ImageResolver, imageWpIds: number[]): LexNode[] {
  const out: LexNode[] = []

  const pushImg = (el: DomNode) => {
    const wpId = parseInt(el.attribs?.['data-wpid'] || '', 10)
    if (!wpId) return
    if (!imageWpIds.includes(wpId)) imageWpIds.push(wpId)
    const mediaId = resolveImage(wpId)
    if (mediaId == null) return
    out.push({ type: 'block', version: 2, format: '', fields: { blockType: 'mediaBlock', media: mediaId } })
  }

  for (const n of nodes) {
    if (n.type === 'text') {
      const t = collapseWs(n.data || '')
      if (t.trim()) out.push(elementNode('paragraph', [textNode(t, 0)]))
      continue
    }
    if (n.type !== 'tag') continue
    const name = tag(n)

    if (/^h[1-6]$/.test(name)) {
      const children = inlineChildren(kids(n), 0)
      if (!isBlank(children)) out.push(elementNode('heading', children, { tag: headingTag(name) }))
    } else if (name === 'p') {
      const imgs = kids(n).filter((c) => c.type === 'tag' && tag(c) === 'img')
      const children = inlineChildren(kids(n), 0)
      if (!isBlank(children)) out.push(elementNode('paragraph', children))
      imgs.forEach(pushImg)
    } else if (name === 'ul' || name === 'ol') {
      const list = listNode(n)
      if ((list.children as LexNode[]).length > 0) out.push(list)
    } else if (name === 'img') {
      pushImg(n)
    } else if (name === 'blockquote') {
      out.push(elementNode('quote', inlineChildren(kids(n), 0)))
    } else if (name === 'hr') {
      out.push({ type: 'horizontalrule', version: 1 })
    } else if (name === 'figure' || name === 'figcaption' || WRAPPERS.includes(name)) {
      // Layout wrappers (flatsome leftovers / tables) → flatten to their blocks.
      out.push(...walkBlocks(kids(n), resolveImage, imageWpIds))
    } else {
      const children = inlineChildren([n], 0)
      if (!isBlank(children)) out.push(elementNode('paragraph', children))
    }
  }
  return out
}

/**
 * Convert WP block-HTML into a Lexical editor state. Two-pass when images are
 * present: pass 1 (resolveImage returns null) collects `imageWpIds` so the
 * caller can upload them; pass 2 emits MediaBlock nodes with real media ids.
 */
export function htmlToLexical(rawHtml: string, resolveImage: ImageResolver = () => null): ConvertResult {
  const html = preprocess(rawHtml)
  const doc = parseDocument(html, { decodeEntities: true }) as unknown as DomNode
  const imageWpIds: number[] = []
  let children = walkBlocks(kids(doc), resolveImage, imageWpIds)
  // Never allow an empty body — Payload richText requires content.
  if (children.length === 0) children = [elementNode('paragraph', [textNode('', 0)])]
  return { root: { root: elementNode('root', children) }, imageWpIds }
}

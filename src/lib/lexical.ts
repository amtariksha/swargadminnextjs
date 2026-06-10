/**
 * Minimal Payload-Lexical JSON <-> plain-text bridge for the ops admin.
 *
 * Phase 2: long_description / ingredients are stored as Payload Lexical JSON so
 * swargfooddotcom's <RichText> renders them natively. The ops admin pages are
 * custom (non-Payload) React, so until a full Lexical WYSIWYG is wired here, the
 * product form edits these as plain text and we serialise to a valid Lexical
 * document (one paragraph per line). This produces correct, renderable Lexical
 * JSON; richer formatting (bold/lists) is a later editor upgrade.
 */

export interface LexicalNode {
  type: string;
  version: number;
  [key: string]: unknown;
}

export interface LexicalDoc {
  root: {
    type: 'root';
    format: '';
    indent: 0;
    version: 1;
    direction: 'ltr' | 'rtl' | null;
    children: LexicalNode[];
  };
}

function textNode(text: string): LexicalNode {
  return { type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' };
}

function paragraphNode(text: string): LexicalNode {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children: text ? [textNode(text)] : [],
  };
}

/**
 * Plain text -> Payload Lexical doc (one paragraph per line). Returns null for
 * blank input so the column stores NULL rather than an empty doc.
 */
export function plainTextToLexical(text: string | null | undefined): LexicalDoc | null {
  const value = (text ?? '').replace(/\r\n/g, '\n');
  if (!value.trim()) return null;
  const children = value.split('\n').map((line) => paragraphNode(line));
  return {
    root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children },
  };
}

/**
 * Payload Lexical doc (or a JSON string of one) -> plain text. Walks paragraph/
 * heading/list nodes and joins their text with newlines. Tolerant of already
 * plain strings and malformed input (returns '').
 */
export function lexicalToPlainText(data: unknown): string {
  if (data == null) return '';
  let doc: unknown = data;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return '';
    // A Lexical doc is JSON starting with '{'; anything else is already text.
    if (trimmed[0] !== '{') return data;
    try { doc = JSON.parse(trimmed); } catch { return data; }
  }
  const root = (doc as LexicalDoc | undefined)?.root;
  if (!root || !Array.isArray(root.children)) return '';

  const collectText = (node: LexicalNode | undefined): string => {
    if (!node) return '';
    if (node.type === 'text' && typeof node.text === 'string') return node.text;
    const kids = (node.children as LexicalNode[] | undefined) || [];
    return kids.map(collectText).join('');
  };

  return root.children.map((block) => collectText(block)).join('\n');
}

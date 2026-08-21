/**
 * Resolving a stall menu tile's picture to a URL.
 *
 * The backend sends whatever is stored on the row — historically that is a bare
 * upload filename ('gelato-alphonso.jpg'), but variant photos uploaded through
 * the newer R2 path are absolute URLs. Both are in the catalogue today, so the
 * client has to cope with either rather than the API pretending it is one shape.
 *
 * Mirrors desicowmilkweb's `getImageUrl` so a product photo resolves to the same
 * file on the storefront and at the till.
 */
import { IMAGE_BASE_URL } from '@/config/tenant';

export function stallImageUrl(raw: string | null | undefined): string | null {
    const path = (raw ?? '').trim();
    if (!path) return null;
    // Absolute (R2 public URL) or a data: URI — already resolved.
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;

    const clean = path.replace(/^\/+/, '');
    // Some rows carry the whole upload path rather than just the leaf, and
    // IMAGE_BASE_URL already ends in /uploads/images — concatenating both would
    // give …/uploads/images/uploads/images/x.jpg and a 404.
    if (clean.includes('uploads/images/')) {
        return `${IMAGE_BASE_URL.replace(/\/uploads\/images\/?$/, '')}/${clean}`;
    }
    return `${IMAGE_BASE_URL}/${clean}`;
}

/**
 * The two-letter monogram a tile falls back to when a product has no photo.
 *
 * A grid where some tiles have pictures and others have a blank grey box reads
 * as broken. Initials read as deliberate, and at a stall where half the menu is
 * chaat (rarely photographed) that is most of the grid.
 */
export function stallInitials(label: string): string {
    const words = label.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * A stable colour per tile, so the same flavour is the same colour every time.
 *
 * Purely visual, but it means an operator learns the grid by shape and colour
 * and stops reading labels — which is the whole point of a touch till.
 */
export function stallTileTint(seed: string): string {
    const TINTS = [
        'bg-rose-500/15 text-rose-200',
        'bg-amber-500/15 text-amber-200',
        'bg-emerald-500/15 text-emerald-200',
        'bg-sky-500/15 text-sky-200',
        'bg-violet-500/15 text-violet-200',
        'bg-teal-500/15 text-teal-200',
        'bg-orange-500/15 text-orange-200',
        'bg-fuchsia-500/15 text-fuchsia-200',
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return TINTS[hash % TINTS.length];
}

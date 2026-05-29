'use client';

/**
 * Tiny presentational swatch — a colour circle or image tile. Shared by
 * the variant list table + the attribute-assignment modal so swatches
 * render consistently wherever an attribute value appears in the admin.
 *
 * Falls back to nothing (returns null) when the value carries neither a
 * swatch_color nor a swatch_image_url, so callers can safely render it
 * for every value without branching.
 */

import { IMAGE_BASE_URL } from '@/config/tenant';

interface SwatchDotProps {
    swatchColor?: string | null;
    swatchImageUrl?: string | null;
    /** px diameter — colour circle / image tile. Default 16. */
    size?: number;
    title?: string;
}

export function SwatchDot({ swatchColor, swatchImageUrl, size = 16, title }: SwatchDotProps) {
    if (swatchImageUrl) {
        // Swatch images go through the same uploads path as product images;
        // absolute URLs (legacy hand-pasted) are used as-is.
        const src = /^https?:\/\//.test(swatchImageUrl)
            ? swatchImageUrl
            : `${IMAGE_BASE_URL}/${swatchImageUrl}`;
        return (
            <img src={src} alt={title || 'swatch'} title={title}
                width={size} height={size}
                className="inline-block rounded object-cover border border-slate-700 align-middle"
                style={{ width: size, height: size }} />
        );
    }
    if (swatchColor) {
        return (
            <span title={title}
                className="inline-block rounded-full border border-slate-700 align-middle"
                style={{ width: size, height: size, backgroundColor: swatchColor }} />
        );
    }
    return null;
}

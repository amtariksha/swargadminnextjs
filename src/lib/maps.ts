/**
 * Phase 4 — Google Maps JS loader + geocoding helpers for the admin panel.
 *
 * The panel had no maps before this. This is the single entry point: it lazily
 * injects the Maps JS API (Places + Geocoding) exactly once and exposes typed
 * helpers for picking an address. The browser-restricted key comes from
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — when it's absent the picker degrades to
 * manual lat/lng entry (callers gate on `isMapsConfigured()`), so the form
 * never hard-depends on Maps being configured.
 */

declare global {
    interface Window {
        google?: typeof google;
    }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const SCRIPT_ID = 'google-maps-js';

export function isMapsConfigured(): boolean {
    return MAPS_API_KEY.length > 0;
}

let loaderPromise: Promise<void> | null = null;

/**
 * Inject the Maps JS API (idempotent). Resolves once `google.maps` is usable.
 * On failure the cached promise is cleared so a later call can retry.
 */
export function loadGoogleMaps(): Promise<void> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('Google Maps can only load in the browser'));
    }
    if (!MAPS_API_KEY) {
        return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set'));
    }
    if (window.google?.maps) return Promise.resolve();
    if (loaderPromise) return loaderPromise;

    loaderPromise = new Promise<void>((resolve, reject) => {
        const onReady = () =>
            window.google?.maps ? resolve() : reject(new Error('Google Maps failed to initialise'));
        const onFail = () => reject(new Error('Google Maps script failed to load'));

        const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (existing) {
            existing.addEventListener('load', onReady);
            existing.addEventListener('error', onFail);
            return;
        }
        const params = new URLSearchParams({
            key: MAPS_API_KEY,
            libraries: 'places',
            loading: 'async',
            v: 'weekly',
        });
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        script.async = true;
        script.defer = true;
        script.onload = onReady;
        script.onerror = onFail;
        document.head.appendChild(script);
    });
    loaderPromise.catch(() => {
        loaderPromise = null;
    });
    return loaderPromise;
}

export interface PickedPlace {
    formatted: string;
    lat: number;
    lng: number;
    city: string;
    area: string;
    pincode: string;
}

const componentOfType = (
    components: google.maps.GeocoderAddressComponent[],
    type: string,
): string => components.find((c) => c.types.includes(type))?.long_name || '';

/**
 * Map Google's address_components to our flat fields. Mirrors the customer
 * app's `set_map_address_pafe.dart`: locality → city, sub-locality/neighborhood
 * → area, postal_code → pincode.
 */
export function extractAddressParts(
    components: google.maps.GeocoderAddressComponent[],
): { city: string; area: string; pincode: string } {
    const city =
        componentOfType(components, 'locality') ||
        componentOfType(components, 'administrative_area_level_2');
    const area =
        componentOfType(components, 'sublocality_level_1') ||
        componentOfType(components, 'sublocality') ||
        componentOfType(components, 'neighborhood');
    const pincode = componentOfType(components, 'postal_code');
    return { city, area, pincode };
}

// ── Pasted Google-Maps / WhatsApp location links ──────────────────────────

/** A lat is -90..90, a lng is -180..180; reject the 0,0 "null island" default. */
function isPlausibleLatLng(lat: number, lng: number): boolean {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180 &&
        !(lat === 0 && lng === 0)
    );
}

/**
 * Pull a lat/lng out of a pasted *long-form* Google-Maps / WhatsApp location
 * link (or a bare "lat, lng" string). Returns null when no coordinates are
 * present — e.g. a short `maps.app.goo.gl` link (see {@link isShortMapsLink}),
 * which only reveals coordinates after a server-side redirect.
 *
 * Patterns, in priority order (most precise first):
 *   1. `?q=`/`query=`/`destination=`/`ll=`/`center=` query params  → the exact point
 *   2. `!3d<lat>!4d<lng>`  → the place-pin embedded in /maps/place/… URLs
 *   3. `/@<lat>,<lng>,<zoom>`  → the map *viewport* centre (least precise)
 *   4. a bare "lat, lng" pasted on its own
 */
export function parseLatLngFromMapsLink(input: string): { lat: number; lng: number } | null {
    const text = (input || '').trim();
    if (!text) return null;

    const num = '(-?\\d+(?:\\.\\d+)?)';
    const ordered: RegExp[] = [
        new RegExp(`[?&](?:q|query|destination|ll|sll|center|daddr)=${num},${num}`, 'i'),
        new RegExp(`!3d${num}!4d${num}`),
        new RegExp(`@${num},${num}`),
    ];
    for (const re of ordered) {
        const m = text.match(re);
        if (m) {
            const lat = parseFloat(m[1]);
            const lng = parseFloat(m[2]);
            if (isPlausibleLatLng(lat, lng)) return { lat, lng };
        }
    }

    // Bare "12.9716, 77.5946" (optionally with surrounding whitespace only).
    const bare = text.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (bare) {
        const lat = parseFloat(bare[1]);
        const lng = parseFloat(bare[2]);
        if (isPlausibleLatLng(lat, lng)) return { lat, lng };
    }

    return null;
}

/**
 * True for Google short links (`maps.app.goo.gl/…`, `goo.gl/maps/…`). Their
 * coordinates are hidden behind an HTTP redirect the browser can't read
 * (CORS), so they must be resolved server-side.
 */
export function isShortMapsLink(input: string): boolean {
    return /(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(input || '');
}

/** Resolve a lat/lng to a {@link PickedPlace}. Returns null when no result. */
export async function reverseGeocode(lat: number, lng: number): Promise<PickedPlace | null> {
    await loadGoogleMaps();
    const geocoder = new google.maps.Geocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    const first = results[0];
    if (!first) return null;
    return {
        formatted: first.formatted_address,
        lat,
        lng,
        ...extractAddressParts(first.address_components),
    };
}

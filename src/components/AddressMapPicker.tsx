'use client';

/**
 * AddressMapPicker — Phase 4. A Places-autocomplete search box over a draggable
 * map marker. Emits a {@link PickedPlace} (formatted address + lat/lng +
 * city/area/pincode) whenever the user searches, drags the marker, or clicks
 * the map. Consumers map those fields into their own form shape.
 *
 * Degrades gracefully: with no `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` it renders a
 * muted notice and the surrounding form keeps its manual address/lat/lng inputs.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Link2, Loader2, MapPin } from 'lucide-react';
import {
    loadGoogleMaps,
    isMapsConfigured,
    extractAddressParts,
    parseLatLngFromMapsLink,
    isShortMapsLink,
    type PickedPlace,
} from '@/lib/maps';
import { POST } from '@/lib/api';

interface AddressMapPickerProps {
    /** Seed the map/marker on mount (e.g. an address being edited). */
    lat?: number | null;
    lng?: number | null;
    onPick: (place: PickedPlace) => void;
    /** Tailwind height class for the map canvas. */
    heightClass?: string;
}

// The business is hyperlocal to Bangalore — default the map there.
const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };

type Status = 'loading' | 'ready' | 'unconfigured' | 'error';

export default function AddressMapPicker({
    lat,
    lng,
    onPick,
    heightClass = 'h-56',
}: AddressMapPickerProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // Keep the latest onPick without re-running the (mount-only) map setup effect.
    const onPickRef = useRef(onPick);
    useEffect(() => {
        onPickRef.current = onPick;
    });
    const configured = isMapsConfigured();
    const [status, setStatus] = useState<Status>(configured ? 'loading' : 'unconfigured');

    // Set once the map is ready; recenters the map+marker to a lat/lng and
    // reverse-geocodes (so a pasted link fills the same fields as a map click).
    const applyLatLngRef = useRef<((lat: number, lng: number) => void) | null>(null);
    const [linkValue, setLinkValue] = useState('');
    const [linkHint, setLinkHint] = useState<'' | 'short' | 'nocoords' | 'resolving'>('');

    const handleLink = async (raw: string) => {
        setLinkValue(raw);
        const v = raw.trim();
        if (!v) {
            setLinkHint('');
            return;
        }
        const parsed = parseLatLngFromMapsLink(v);
        if (parsed) {
            setLinkHint('');
            applyLatLngRef.current?.(parsed.lat, parsed.lng);
            return;
        }
        if (isShortMapsLink(v)) {
            // Short links hide coordinates behind a redirect → ask the backend.
            setLinkHint('resolving');
            try {
                const { data } = await POST<{ lat: number; lng: number } | null>(
                    '/daytime/resolve_map_link',
                    { url: v },
                );
                if (data && applyLatLngRef.current) {
                    applyLatLngRef.current(data.lat, data.lng);
                    setLinkHint('');
                } else {
                    setLinkHint('short');
                }
            } catch {
                setLinkHint('short');
            }
            return;
        }
        setLinkHint(/https?:\/\//i.test(v) ? 'nocoords' : '');
    };

    useEffect(() => {
        if (!configured) return;
        let cancelled = false;

        loadGoogleMaps()
            .then(() => {
                if (cancelled || !mapRef.current) return;
                const seeded = lat != null && lng != null;
                const center = seeded ? { lat, lng } : DEFAULT_CENTER;
                // Classic Marker (not AdvancedMarkerElement) so the owner only
                // needs an API key — no cloud Map ID to configure.
                const map = new google.maps.Map(mapRef.current, {
                    center,
                    zoom: seeded ? 16 : 12,
                    disableDefaultUI: true,
                    zoomControl: true,
                    clickableIcons: false,
                });
                const marker = new google.maps.Marker({ map, position: center, draggable: true });

                const emitFromLatLng = (pos: google.maps.LatLng) => {
                    const latitude = pos.lat();
                    const longitude = pos.lng();
                    new google.maps.Geocoder()
                        .geocode({ location: pos })
                        .then(({ results }) => {
                            const first = results[0];
                            onPickRef.current({
                                formatted: first?.formatted_address || '',
                                lat: latitude,
                                lng: longitude,
                                ...(first
                                    ? extractAddressParts(first.address_components)
                                    : { city: '', area: '', pincode: '' }),
                            });
                        })
                        .catch(() => {
                            // Keep the coordinates even if reverse-geocoding fails.
                            onPickRef.current({
                                formatted: '',
                                lat: latitude,
                                lng: longitude,
                                city: '',
                                area: '',
                                pincode: '',
                            });
                        });
                };

                marker.addListener('dragend', () => {
                    const p = marker.getPosition();
                    if (p) emitFromLatLng(p);
                });
                map.addListener('click', (e: google.maps.MapMouseEvent) => {
                    if (!e.latLng) return;
                    marker.setPosition(e.latLng);
                    emitFromLatLng(e.latLng);
                });

                applyLatLngRef.current = (latitude, longitude) => {
                    const pos = new google.maps.LatLng(latitude, longitude);
                    map.setCenter(pos);
                    map.setZoom(16);
                    marker.setPosition(pos);
                    emitFromLatLng(pos);
                };

                if (inputRef.current) {
                    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
                        fields: ['geometry', 'formatted_address', 'address_components'],
                        componentRestrictions: { country: 'in' },
                    });
                    autocomplete.addListener('place_changed', () => {
                        const place = autocomplete.getPlace();
                        const loc = place.geometry?.location;
                        if (!loc) return;
                        map.setCenter(loc);
                        map.setZoom(16);
                        marker.setPosition(loc);
                        onPickRef.current({
                            formatted: place.formatted_address || '',
                            lat: loc.lat(),
                            lng: loc.lng(),
                            ...(place.address_components
                                ? extractAddressParts(place.address_components)
                                : { city: '', area: '', pincode: '' }),
                        });
                    });
                }
                setStatus('ready');
            })
            .catch(() => {
                if (!cancelled) setStatus('error');
            });

        return () => {
            cancelled = true;
        };
        // Mount-only: seed values are read once; onPick is read via ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (status === 'unconfigured') {
        return (
            <div className="flex items-start gap-2 rounded-xl border border-slate-700/50 bg-slate-900/40 p-3 text-xs text-slate-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>
                    Map picker unavailable — set <code className="text-slate-300">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to
                    enable address search. You can still enter the address and coordinates manually below.
                </span>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="relative">
                {linkHint === 'resolving' ? (
                    <Loader2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 animate-spin text-slate-500" />
                ) : (
                    <Link2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                )}
                <input
                    type="text"
                    value={linkValue}
                    onChange={(e) => handleLink(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.preventDefault();
                    }}
                    placeholder="Paste a Google Maps / WhatsApp location link…"
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-900/50 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 transition-colors focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
            </div>
            {linkHint === 'short' && (
                <p className="text-xs text-amber-300">
                    Couldn’t resolve that short link. Open it once, then paste the full URL — or drop the pin manually.
                </p>
            )}
            {linkHint === 'nocoords' && (
                <p className="text-xs text-amber-300">
                    No coordinates in that link. Paste a full Google Maps URL, or drop the pin manually.
                </p>
            )}
            <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search address or place…"
                    // Prevent Enter (selecting a suggestion) from submitting the parent form.
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.preventDefault();
                    }}
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-900/50 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 transition-colors focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
            </div>
            <div className="relative overflow-hidden rounded-xl border border-slate-700/50">
                <div ref={mapRef} className={`w-full ${heightClass} bg-slate-900/60`} />
                {status === 'loading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-xs text-slate-400">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map…
                    </div>
                )}
                {status === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/70 p-3 text-center text-xs text-amber-300">
                        <AlertTriangle className="h-4 w-4" /> Map failed to load. Check the API key and that
                        Maps JS + Places are enabled.
                    </div>
                )}
            </div>
            <p className="text-xs text-slate-500">Search, drag the pin, or tap the map to set the exact spot.</p>
        </div>
    );
}

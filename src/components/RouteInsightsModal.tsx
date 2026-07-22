'use client';

/**
 * Route insights for one driver + date — timing summary, ready-made Google
 * Maps direction links (chunked ≤10 points by the backend), and the ordered
 * stop list with actual visit order + not-delivered reasons.
 *
 * Backed by GET /delivery_route/{date}/{driver_user_id}. Mounted from the
 * Delivery List page when a specific driver is selected.
 */

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';
import { getStatusLabel } from '@/lib/deliveryHelpers';
import { AlertTriangle, ExternalLink, MapPin, Navigation, RefreshCw, X } from 'lucide-react';

interface RouteStop {
    pre_delivery_id: number;
    order_id: number;
    name: string;
    apartment_name?: string | null;
    flat_no?: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
    planned_position: number;
    sort_order_by_driver?: number | null;
    mark_delivered_time_stamp?: string | null;
    status?: number | null;
    reason?: string | null;
}

interface RouteMapLink {
    label: string;
    url: string;
    stop_count: number;
}

interface RouteSummary {
    stops: number;
    delivered: number;
    not_delivered: number;
    first_delivery_at?: string | null;
    last_delivery_at?: string | null;
    active_window_minutes?: number | string | null;
    avg_minutes_per_stop?: number | string | null;
}

interface RouteInsights {
    driver: { user_id: number; name: string };
    start: { name: string; lat: number; lng: number } | null;
    ordering_source: 'manual' | 'auto' | 'legacy';
    order_used: 'actual' | 'planned';
    stops: RouteStop[];
    summary: RouteSummary;
    maps: { links: RouteMapLink[]; unlocated_count: number };
}

interface RouteInsightsModalProps {
    date: string;
    driverUserId: number;
    driverName: string;
    onClose: () => void;
}

/** Timestamps rendered in IST regardless of the operator's browser TZ. */
function formatIstTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

/** Minutes → "X h Y m". */
function formatWindow(minutes: number | string | null | undefined): string {
    const n = Number(minutes);
    if (!Number.isFinite(n) || n <= 0) return '—';
    const h = Math.floor(n / 60);
    const m = Math.round(n % 60);
    return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

function formatAvgMinutes(value: number | string | null | undefined): string {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${Math.round(n * 10) / 10} min`;
}

const ORDER_USED_LABELS: Record<RouteInsights['order_used'], string> = {
    actual: 'actual driver order',
    planned: 'planned order',
};

const ORDERING_SOURCE_LABELS: Record<RouteInsights['ordering_source'], string> = {
    manual: 'manual ordering',
    auto: 'auto ordering',
    legacy: 'legacy ordering',
};

export default function RouteInsightsModal({ date, driverUserId, driverName, onClose }: RouteInsightsModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['delivery-route', date, driverUserId],
        queryFn: async () => (await GET<RouteInsights>(`/delivery_route/${date}/${driverUserId}`)).data,
    });

    // Component only mounts while open, so register esc/scroll-lock unconditionally.
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEsc);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'unset';
        };
    }, [onClose]);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };

    const summary = data?.summary;
    const summaryCards: { label: string; value: string }[] = [
        { label: 'Stops', value: summary ? String(summary.stops) : '—' },
        { label: 'Delivered', value: summary ? `${summary.delivered} / ${summary.stops}` : '—' },
        { label: 'First stop', value: formatIstTime(summary?.first_delivery_at) },
        { label: 'Last stop', value: formatIstTime(summary?.last_delivery_at) },
        { label: 'Active window', value: formatWindow(summary?.active_window_minutes) },
        { label: 'Avg min/stop', value: formatAvgMinutes(summary?.avg_minutes_per_stop) },
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={handleBackdropClick}
        >
            <div
                ref={modalRef}
                className="w-full max-w-4xl max-h-[88vh] overflow-y-auto glass rounded-2xl shadow-2xl animate-slide-in"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800/50 sticky top-0 bg-slate-900/90 backdrop-blur-sm rounded-t-2xl z-10">
                    <div>
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                            <Navigation className="w-5 h-5 text-purple-400" /> Route insights — {driverName}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {date}
                            {data && <> · {ORDERING_SOURCE_LABELS[data.ordering_source] || data.ordering_source}</>}
                            {data?.start && <> · starts at {data.start.name}</>}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {isLoading && (
                        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
                            <RefreshCw className="w-5 h-5 animate-spin" /> Loading route…
                        </div>
                    )}

                    {isError && (
                        <div className="flex items-center justify-between gap-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                            <span className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {error instanceof Error ? error.message : 'Failed to load route'}
                            </span>
                            <button onClick={() => refetch()} disabled={isFetching}
                                className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-300 text-xs disabled:opacity-50">
                                Retry
                            </button>
                        </div>
                    )}

                    {data && (
                        <>
                            {/* Summary cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                {summaryCards.map((c) => (
                                    <div key={c.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                                        <div className="text-xs text-slate-400">{c.label}</div>
                                        <div className="text-lg font-bold text-white mt-0.5">{c.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Google Maps links */}
                            {data.maps.links.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm font-semibold text-white">Open route in Google Maps</h4>
                                        <span className="text-xs px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                            {ORDER_USED_LABELS[data.order_used] || data.order_used}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {data.maps.links.map((link) => (
                                            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-sm font-medium hover:bg-blue-500/30 transition-colors">
                                                <MapPin className="w-4 h-4" />
                                                {link.label}
                                                <span className="text-xs text-blue-300/70">({link.stop_count} stops)</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {data.maps.unlocated_count > 0 && (
                                <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    {data.maps.unlocated_count} stop{data.maps.unlocated_count === 1 ? ' has' : 's have'} no
                                    map pin — fix their address
                                </div>
                            )}

                            {/* Ordered stop table */}
                            <div className="overflow-x-auto rounded-xl border border-slate-800/50">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-800/50 text-xs text-slate-400">
                                            <th className="px-3 py-2 text-left font-medium">#</th>
                                            <th className="px-3 py-2 text-left font-medium">Customer</th>
                                            <th className="px-3 py-2 text-left font-medium">Apartment · Flat</th>
                                            <th className="px-3 py-2 text-left font-medium">Visit #</th>
                                            <th className="px-3 py-2 text-left font-medium">Delivered at (IST)</th>
                                            <th className="px-3 py-2 text-left font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.stops.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                                                    No stops on this route for {date}
                                                </td>
                                            </tr>
                                        )}
                                        {data.stops.map((stop) => {
                                            const status = getStatusLabel(Number(stop.status));
                                            const apartmentFlat =
                                                [stop.apartment_name, stop.flat_no].filter(Boolean).join(' · ') || '—';
                                            return (
                                                <tr key={stop.pre_delivery_id} className="border-t border-slate-800/50">
                                                    <td className="px-3 py-2 text-slate-400">{stop.planned_position}</td>
                                                    <td className="px-3 py-2 text-white">{stop.name}</td>
                                                    <td className="px-3 py-2 text-slate-300">{apartmentFlat}</td>
                                                    <td className="px-3 py-2 text-slate-300">
                                                        {stop.sort_order_by_driver != null ? stop.sort_order_by_driver : '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-300">
                                                        {formatIstTime(stop.mark_delivered_time_stamp)}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                                                        {Number(stop.status) === 2 && stop.reason && (
                                                            <div className="text-xs text-red-300/80 mt-0.5">{stop.reason}</div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

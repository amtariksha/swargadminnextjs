'use client';

import { useMemo, useState } from 'react';
import { MessageSquareText, AlertTriangle, Send, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    useNotificationCatalog,
    useNotificationMaps,
    useRemoteTemplates,
    useUpsertNotificationMap,
    useTestNotificationMap,
    type NotificationMap,
    type NotificationSource,
    type NotificationMapConfig,
    type RemoteTemplate,
} from '@/hooks/useData';

// =============================================================================
// Settings → Notification Mapping
//
// Per-tenant, config-driven WhatsApp notification mapping. The operator picks a
// synced msg91 template per event and wires each {{placeholder}} / button /
// header to a known DATA SOURCE token — then previews + sends a test — WITHOUT
// a backend release. Saved to the Node backend (notification_template_map).
//
// The template's SHAPE (image header? which placeholders? which button slot?)
// is read live from the WhatsApp module's /api/whatsapp/templates (primary
// number). The mapping + send live in the Node backend, which never reads
// Supabase — so the saved config carries everything the send needs.
// =============================================================================

const selectClass =
    'w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50';
const inputClass =
    'w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50';

/** Case-insensitive component lookup by msg91 type ('BODY'/'HEADER'/'BUTTONS'). */
function findComponent(t: RemoteTemplate | undefined, kind: string) {
    if (!t) return undefined;
    return t.components.find((c) => (c.type || '').toUpperCase() === kind);
}

/** Ordered, de-duplicated {{placeholders}} from a template's BODY text. */
function parsePlaceholders(t: RemoteTemplate | undefined): string[] {
    const body = findComponent(t, 'BODY');
    if (!body?.text) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    const re = /\{\{\s*([\w]+)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body.text)) !== null) {
        if (!seen.has(m[1])) {
            seen.add(m[1]);
            out.push(m[1]);
        }
    }
    return out;
}

/** Does the template carry an image/media header? */
function hasImageHeader(t: RemoteTemplate | undefined): boolean {
    const header = findComponent(t, 'HEADER');
    const fmt = (header?.format || '').toUpperCase();
    return fmt === 'IMAGE' || fmt === 'VIDEO' || fmt === 'DOCUMENT';
}

/**
 * 1-based slot of the dynamic URL button (counts quick-reply buttons before it,
 * matching msg91's button_<N> convention). null when no URL button is present.
 */
function urlButtonSlot(t: RemoteTemplate | undefined): number | null {
    const btns = findComponent(t, 'BUTTONS')?.buttons;
    if (!Array.isArray(btns)) return null;
    const idx = btns.findIndex((b) => /url/i.test(b?.type || '') || !!b?.url);
    return idx >= 0 ? idx + 1 : null;
}

/** Suggest a source token for a placeholder by exact match, then a small alias map. */
function suggestSource(placeholder: string, sources: NotificationSource[]): string {
    const p = placeholder.toLowerCase();
    if (sources.some((s) => s.token === p)) return p;
    const alias: Record<string, string> = {
        name: 'customer_name',
        customer: 'customer_name',
        orderno: 'order_no',
        order: 'order_no',
        orderid: 'order_id',
        itemlist: 'items_text',
        items: 'items_text',
        orderamount: 'total_amount',
        amount: 'total_amount',
        total: 'total_amount',
        paymentlink: 'payment_link',
        link: 'payment_link',
        date: 'delivery_date',
        deliverydate: 'delivery_date',
        time: 'desired_time',
        address: 'delivery_address',
        phone: 'customer_phone',
    };
    const guess = alias[p];
    return guess && sources.some((s) => s.token === guess) ? guess : '';
}

interface EventCardProps {
    map: NotificationMap;
    sources: NotificationSource[];
    templates: RemoteTemplate[];
    templatesError: string | null;
}

function EventCard({ map, sources, templates, templatesError }: EventCardProps) {
    const upsert = useUpsertNotificationMap();
    const test = useTestNotificationMap();

    const [templateName, setTemplateName] = useState(map.template_name || '');
    const [language, setLanguage] = useState(map.language || '');
    const [enabled, setEnabled] = useState(map.enabled);
    const [manualMode, setManualMode] = useState(templates.length === 0);
    // EXPLICIT operator choices only (seeded from the saved config). A placeholder
    // absent here falls back to a name-based SUGGESTION — derived, never stored,
    // so picking a template needs no setState-in-effect (which cascades renders).
    const [bodyOverrides, setBodyOverrides] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        for (const b of map.config?.body || []) init[b.placeholder] = b.source;
        return init;
    });
    const [headerSource, setHeaderSource] = useState(map.config?.header?.source || 'tenant_header_image');
    const [buttonSource, setButtonSource] = useState(map.config?.button?.source || '');
    // null = follow the template's auto-detected slot; a number = operator override.
    const [buttonNumberOverride, setButtonNumberOverride] = useState<number | null>(
        map.config?.button?.number ?? null,
    );
    const [testPhone, setTestPhone] = useState('');

    // The selected remote template (when picked from the synced list).
    const selected = useMemo(
        () => templates.find((t) => t.name === templateName),
        [templates, templateName],
    );

    const placeholders = useMemo(() => parsePlaceholders(selected), [selected]);
    const imageHeader = useMemo(() => hasImageHeader(selected), [selected]);
    const detectedSlot = useMemo(() => urlButtonSlot(selected), [selected]);
    const bodyText = findComponent(selected, 'BODY')?.text || '';

    // In manual mode, the editable placeholder rows come from the saved config.
    const manualPlaceholders = useMemo(
        () => (map.config?.body || []).map((b) => b.placeholder),
        [map.config],
    );
    const activePlaceholders = selected ? placeholders : manualPlaceholders;
    const showButton = selected ? detectedSlot != null || !!buttonSource : !!buttonSource;
    const showHeader = selected ? imageHeader : (map.config?.header?.kind === 'image');

    // Effective (displayed) source for a placeholder: the operator's explicit
    // choice if any, else a name-based suggestion. The button slot follows the
    // override, then the template's auto-detected slot, then a sane default.
    const effectiveSource = (p: string): string =>
        bodyOverrides[p] !== undefined ? bodyOverrides[p] : suggestSource(p, sources);
    const buttonNumber = buttonNumberOverride ?? detectedSlot ?? 4;

    function buildConfig(): NotificationMapConfig {
        const cfg: NotificationMapConfig = {
            body: activePlaceholders.map((p) => ({ placeholder: p, source: effectiveSource(p) })),
            header: { kind: showHeader ? 'image' : 'none', source: headerSource },
        };
        if (buttonSource) cfg.button = { number: buttonNumber, source: buttonSource };
        return cfg;
    }

    async function handleSave() {
        if (!templateName.trim()) {
            toast.error('Pick (or enter) a template first');
            return;
        }
        try {
            await upsert.mutateAsync({
                event: map.event,
                template_name: templateName.trim(),
                language: language || undefined,
                enabled,
                config: buildConfig(),
            });
            toast.success(`${map.label} mapping saved`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save mapping');
        }
    }

    async function handleTest() {
        if (!testPhone.trim()) {
            toast.error('Enter a test phone number');
            return;
        }
        if (!templateName.trim()) {
            toast.error('Pick (or enter) a template first');
            return;
        }
        try {
            await test.mutateAsync({
                event: map.event,
                phone: testPhone.trim(),
                template_name: templateName.trim(),
                language: language || undefined,
                config: buildConfig(),
            });
            toast.success(`Test sent to ${testPhone.trim()}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Test failed');
        }
    }

    const sourceLabel = (token: string) => sources.find((s) => s.token === token)?.label || token;

    // Wiring preview: body text with each {{placeholder}} swapped for its mapped
    // source label, so the operator sees the data flow before a real send.
    const preview = useMemo(() => {
        if (!bodyText) return '';
        return bodyText.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_full, name: string) => {
            const src = effectiveSource(name);
            return src ? `[${sourceLabel(src)}]` : `{{${name}}}`;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bodyText, bodyOverrides, sources]);

    return (
        <div className="glass rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-white">{map.label}</h3>
                    <p className="text-xs text-slate-500 font-mono">{map.event}</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="accent-purple-500"
                    />
                    Enabled
                </label>
            </div>

            {/* Template selector */}
            <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-slate-500">Template</label>
                {manualMode ? (
                    <input
                        type="text"
                        value={templateName}
                        placeholder="msg91 template name"
                        onChange={(e) => setTemplateName(e.target.value)}
                        className={`${inputClass} font-mono`}
                    />
                ) : (
                    <select
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        className={selectClass}
                    >
                        <option value="">— select a template —</option>
                        {templates.map((t) => (
                            <option key={`${t.name}-${t.language}`} value={t.name}>
                                {t.name} ({t.language})
                            </option>
                        ))}
                    </select>
                )}
                <div className="flex items-center gap-3 text-xs">
                    <button
                        type="button"
                        onClick={() => setManualMode((v) => !v)}
                        className="text-purple-300 hover:text-purple-200"
                    >
                        {manualMode ? 'Pick from synced list' : 'Enter name manually'}
                    </button>
                    {!map.configured && (
                        <span className="text-amber-400/80">Not configured — using legacy fallback</span>
                    )}
                </div>
            </div>

            {/* Body placeholder → source rows */}
            {activePlaceholders.length > 0 && (
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider text-slate-500">Body variables</label>
                    {activePlaceholders.map((p) => (
                        <div key={p} className="flex items-center gap-2">
                            <code className="text-xs text-purple-200 bg-slate-800/60 rounded px-2 py-1 w-40 shrink-0 truncate">
                                {`{{${p}}}`}
                            </code>
                            <select
                                value={effectiveSource(p)}
                                onChange={(e) => setBodyOverrides((prev) => ({ ...prev, [p]: e.target.value }))}
                                className={selectClass}
                            >
                                <option value="">— choose source —</option>
                                {sources.map((s) => (
                                    <option key={s.token} value={s.token}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            )}

            {/* Image header source */}
            {showHeader && (
                <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wider text-slate-500">Image header source</label>
                    <select
                        value={headerSource}
                        onChange={(e) => setHeaderSource(e.target.value)}
                        className={selectClass}
                    >
                        {sources.map((s) => (
                            <option key={s.token} value={s.token}>{s.label}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* URL button slot + source */}
            {showButton && (
                <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wider text-slate-500">
                        URL button {detectedSlot != null && (
                            <span className="text-emerald-400/80 normal-case">(auto-detected slot {detectedSlot})</span>
                        )}
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={1}
                            value={buttonNumber}
                            onChange={(e) => setButtonNumberOverride(Number(e.target.value) || 1)}
                            className={`${inputClass} w-20 shrink-0`}
                            title="Button slot (button_N)"
                        />
                        <select
                            value={buttonSource}
                            onChange={(e) => setButtonSource(e.target.value)}
                            className={selectClass}
                        >
                            <option value="">— no dynamic URL button —</option>
                            {sources.map((s) => (
                                <option key={s.token} value={s.token}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Wiring preview */}
            {preview && (
                <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wider text-slate-500">Preview (wiring)</label>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-900/50 rounded-lg p-3 border border-slate-800">
                        {preview}
                    </p>
                </div>
            )}

            {/* Actions: language, test, save */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                    type="text"
                    value={language}
                    placeholder="lang (e.g. en)"
                    onChange={(e) => setLanguage(e.target.value)}
                    className={`${inputClass} w-28`}
                />
                <input
                    type="tel"
                    value={testPhone}
                    placeholder="Test phone (91XXXXXXXXXX)"
                    onChange={(e) => setTestPhone(e.target.value)}
                    className={`${inputClass} flex-1 min-w-[180px]`}
                />
                <button
                    type="button"
                    onClick={handleTest}
                    disabled={test.isPending}
                    className="px-3 py-1.5 text-xs rounded-lg bg-slate-700/50 text-slate-200 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                    {test.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send test
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={upsert.isPending}
                    className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/30 text-purple-200 hover:bg-purple-500/40 disabled:opacity-50 flex items-center gap-1.5"
                >
                    {upsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                </button>
            </div>

            {templatesError && !selected && (
                <p className="text-xs text-amber-400/80">
                    Could not load synced templates ({templatesError}). Enter the template name manually and map the
                    saved variables.
                </p>
            )}
        </div>
    );
}

export default function NotificationMapsPage() {
    const catalog = useNotificationCatalog();
    const maps = useNotificationMaps();
    const templatesQuery = useRemoteTemplates();

    const templates = templatesQuery.data || [];
    const templatesError = templatesQuery.error instanceof Error ? templatesQuery.error.message : null;

    const isLoading = catalog.isLoading || maps.isLoading;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <MessageSquareText className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Notification Mapping</h1>
                    <p className="text-slate-400">
                        Wire each day-order WhatsApp template to your data — variables, button, image header — and test
                        it. No backend release needed.
                    </p>
                </div>
            </div>

            <div className="glass rounded-xl p-4 flex items-start gap-3 text-sm text-slate-300">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p>
                    Pick a synced template per event, map each <code className="text-purple-200">{'{{variable}}'}</code>,
                    the dynamic URL button, and the image header to a data source, then <strong>Send test</strong> to
                    your phone. Events left unconfigured keep sending via the existing built-in template. Templates are
                    read from your <strong>primary</strong> WhatsApp number.
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading events…
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(maps.data || []).map((m) => (
                        <EventCard
                            key={m.event}
                            map={m}
                            sources={catalog.data?.sources?.[m.domain] || []}
                            templates={templates}
                            templatesError={templatesError}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

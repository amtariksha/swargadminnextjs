'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import {
    Bell,
    AlertTriangle,
    ToggleLeft,
    ToggleRight,
    Plus,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// =============================================================================
// Settings → Notifications & WhatsApp Templates
//
// One dedicated screen for all notification-control rows that previously lived
// scattered across the flat General Settings table. Source data still lives in
// the same `app_settings` table (plus `web_app_settings` for one row); this
// page just collects the relevant titles into a focused UI.
//
// Layout sections:
//   1. Master switches  — kill switches for each outbound channel.
//   2. WhatsApp / MSG91 templates — per-scenario template names.
//   3. Admin recipients — JSON list of admins who receive admin-targeted
//      WhatsApp/SMS alerts.
//
// Keep TEMPLATE_TITLES / KILL_SWITCH_TITLES / ADMIN_PHONES_TITLE in sync with
// the MANAGED_ELSEWHERE filter in src/app/(dashboard)/settings/page.tsx.
// =============================================================================

interface AppSetting {
    setting_id: number;
    id?: number;
    title: string;
    value: string;
    updated_at?: string;
}

interface WebAppSetting {
    id: number;
    title: string;
    value: string;
}

interface AdminPhone {
    phone: string;
    name?: string;
    email?: string;
}

// MSG91/WhatsApp templates — each row maps a notification scenario to a
// template name configured in the MSG91 console. Empty value = silence that
// scenario (the backend skips gracefully).
const TEMPLATE_FIELDS: { title: string; description: string; placeholder: string }[] = [
    {
        title: 'Order Delivery Template',
        description: 'Sent to the customer when their order is marked delivered.',
        placeholder: 'e.g. app_subscription_successful_3',
    },
    {
        title: 'Partial Delivery',
        description: 'Sent when delivered qty is less than ordered qty.',
        placeholder: 'e.g. app_partial_delivery',
    },
    {
        title: 'Delivery List Admin Alert',
        description: 'Admin alert when the daily generate-list run had unassigned / partial / skipped orders.',
        placeholder: 'e.g. internal_delivery_alert',
    },
    {
        title: 'Low Balance',
        description: 'Customer reminder when wallet falls below the projected-threshold (see Low Balance Threshold).',
        placeholder: 'e.g. app_low_wallet',
    },
    {
        title: 'Daytime Payment Template',
        description: 'Day-order payment link. Approved template must have 5 variables: '
            + '{{1}} customer name · {{2}} order # · {{3}} items (qty × product) · '
            + '{{4}} amount · {{5}} payment link.',
        placeholder: 'e.g. app_daytime_payment',
    },
    {
        title: 'Daytime Order Placed Template',
        description: 'Sent to the customer when a day-time order is placed (confirmed).',
        placeholder: 'e.g. app_daytime_order_placed',
    },
    {
        title: 'Daytime Order Picked Template',
        description: 'Sent when a day driver picks up (claims) the order from the pool.',
        placeholder: 'e.g. app_daytime_order_picked',
    },
    {
        title: 'Daytime Order Delivered Template',
        description: 'Sent to the customer when the day-time order is marked delivered.',
        placeholder: 'e.g. app_daytime_order_delivered',
    },
    {
        title: 'New User Registered Admin',
        description: 'Admin notification fired on every new customer signup.',
        placeholder: 'e.g. swarg_internal_notification',
    },
];

// Kill-switch master toggles. Each lives in EITHER app_settings or
// web_app_settings — handled by separate save endpoints below.
const APP_KILL_SWITCHES: { title: string; description: string }[] = [
    {
        title: 'Send Email',
        description: 'Global on/off for outbound email. Per-customer opt-in still applies on top.',
    },
];
const WEB_KILL_SWITCHES: { title: string; description: string }[] = [
    {
        title: 'Send WhatsApp Message',
        description: 'Global on/off for WhatsApp messages (customer + admin alerts).',
    },
];

const ADMIN_PHONES_TITLE = 'Admin Phone Numbers';

// Match the backend parser tolerance — anything not explicitly "off" is on.
const DISABLED_VALUES = new Set(['', '0', 'no', 'off', 'false', 'disabled']);
function isEnabled(value: string | undefined | null): boolean {
    if (value == null) return false;
    return !DISABLED_VALUES.has(String(value).trim().toLowerCase());
}

/** Preserve the case-style the row already uses ('Yes'/'No', '1'/'0', 'yes'/'no'). */
function flipFlagValue(current: string, next: boolean): string {
    const trimmed = String(current ?? '').trim();
    if (trimmed === 'Yes' || trimmed === 'No') return next ? 'Yes' : 'No';
    if (trimmed === '1' || trimmed === '0') return next ? '1' : '0';
    return next ? 'yes' : 'no';
}

/** Tolerant parse of the Admin Phone Numbers value — handles single-object
 *  legacy shape, double-encoded JSON, and trailing junk. Returns []
 *  on unparseable. */
function parseAdminPhones(raw: string | undefined | null): AdminPhone[] {
    if (!raw) return [];
    const tryParse = (s: string): unknown => {
        try { return JSON.parse(s); } catch { return undefined; }
    };
    let parsed = tryParse(raw);
    if (typeof parsed === 'string') parsed = tryParse(parsed); // double-encoded
    if (Array.isArray(parsed)) {
        return parsed.filter((p) => p && typeof p === 'object').map((p) => ({
            phone: String((p as Record<string, unknown>).phone ?? ''),
            name: typeof (p as Record<string, unknown>).name === 'string' ? (p as Record<string, unknown>).name as string : undefined,
            email: typeof (p as Record<string, unknown>).email === 'string' ? (p as Record<string, unknown>).email as string : undefined,
        })).filter((p) => p.phone);
    }
    if (parsed && typeof parsed === 'object' && 'phone' in (parsed as object)) {
        const p = parsed as Record<string, unknown>;
        return [{
            phone: String(p.phone ?? ''),
            name: typeof p.name === 'string' ? p.name : undefined,
            email: typeof p.email === 'string' ? p.email : undefined,
        }].filter((x) => x.phone);
    }
    return [];
}

export default function NotificationSettingsPage() {
    const queryClient = useQueryClient();
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingTitle, setSavingTitle] = useState<string | null>(null);
    const [phoneDraft, setPhoneDraft] = useState<AdminPhone[] | null>(null);
    const [savingPhones, setSavingPhones] = useState(false);

    const { data: appSettings = [], isLoading: appLoading } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const response = await GET<AppSetting[]>('/get_settings');
            return response.data || [];
        },
    });

    const { data: webSettings = [], isLoading: webLoading } = useQuery({
        queryKey: ['web-app-settings'],
        queryFn: async () => {
            const response = await GET<WebAppSetting[]>('/get_web_app_settings');
            return response.data || [];
        },
    });

    const findApp = (title: string) => appSettings.find((s) => s.title === title);
    const findWeb = (title: string) => webSettings.find((s) => s.title === title);

    const adminPhoneRow = findApp(ADMIN_PHONES_TITLE);
    const persistedPhones = useMemo(
        () => parseAdminPhones(adminPhoneRow?.value),
        [adminPhoneRow?.value],
    );
    const currentPhones = phoneDraft ?? persistedPhones;
    const phonesDirty =
        phoneDraft != null && JSON.stringify(phoneDraft) !== JSON.stringify(persistedPhones);

    const saveAppSetting = async (title: string, value: string) => {
        const row = findApp(title);
        if (!row) {
            toast.error(`Setting "${title}" not found — backend migration may be pending`);
            return;
        }
        setSavingTitle(title);
        try {
            await POST('/update_settings', { setting_id: row.setting_id, value });
            await queryClient.invalidateQueries({ queryKey: ['settings'] });
            setDrafts((prev) => {
                const copy = { ...prev };
                delete copy[title];
                return copy;
            });
            toast.success(`${title} saved`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save');
        } finally {
            setSavingTitle(null);
        }
    };

    const saveWebSetting = async (title: string, value: string) => {
        const row = findWeb(title);
        if (!row) {
            toast.error(`Setting "${title}" not found`);
            return;
        }
        setSavingTitle(title);
        try {
            await POST('/update_web_app_settings', { id: row.id, value });
            await queryClient.invalidateQueries({ queryKey: ['web-app-settings'] });
            toast.success(`${title} saved`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save');
        } finally {
            setSavingTitle(null);
        }
    };

    const handleSaveAdminPhones = async () => {
        if (!adminPhoneRow) {
            toast.error(`Setting "${ADMIN_PHONES_TITLE}" not found`);
            return;
        }
        const cleaned = (phoneDraft ?? []).filter((p) => p.phone.trim().length > 0).map((p) => ({
            phone: p.phone.trim(),
            ...(p.name && p.name.trim() ? { name: p.name.trim() } : {}),
            ...(p.email && p.email.trim() ? { email: p.email.trim() } : {}),
        }));
        setSavingPhones(true);
        try {
            await POST('/update_settings', {
                setting_id: adminPhoneRow.setting_id,
                value: JSON.stringify(cleaned),
            });
            await queryClient.invalidateQueries({ queryKey: ['settings'] });
            setPhoneDraft(null);
            toast.success('Admin phone numbers saved');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save admin phones');
        } finally {
            setSavingPhones(false);
        }
    };

    const loading = appLoading || webLoading;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Bell className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Notifications &amp; WhatsApp Templates</h1>
                    <p className="text-slate-400">
                        Master switches for each outbound channel, MSG91/WhatsApp template names
                        per scenario, and admin recipient list.
                    </p>
                </div>
            </div>

            <div className="glass rounded-xl p-4 flex items-start gap-3 text-sm text-slate-300">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p>
                    All values are stored in the existing settings tables — this page is just the
                    operator-friendly editor. The backend reads them live; saves apply within a
                    minute (caches refresh on the next request).
                </p>
            </div>

            {loading ? (
                <p className="text-slate-400">Loading…</p>
            ) : (
                <>
                    {/* ============================ Master switches ========================= */}
                    <section className="space-y-3">
                        <h2 className="text-sm uppercase tracking-wider text-slate-500 font-medium">
                            Master switches
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {WEB_KILL_SWITCHES.map((k) => {
                                const row = findWeb(k.title);
                                return (
                                    <KillSwitchCard
                                        key={k.title}
                                        title={k.title}
                                        description={k.description}
                                        value={row?.value}
                                        missing={!row}
                                        saving={savingTitle === k.title}
                                        onToggle={(next) => row && saveWebSetting(k.title, flipFlagValue(row.value, next))}
                                    />
                                );
                            })}
                            {APP_KILL_SWITCHES.map((k) => {
                                const row = findApp(k.title);
                                return (
                                    <KillSwitchCard
                                        key={k.title}
                                        title={k.title}
                                        description={k.description}
                                        value={row?.value}
                                        missing={!row}
                                        saving={savingTitle === k.title}
                                        onToggle={(next) => row && saveAppSetting(k.title, flipFlagValue(row.value, next))}
                                    />
                                );
                            })}
                        </div>
                    </section>

                    {/* ============================ Templates ============================= */}
                    <section className="space-y-3">
                        <h2 className="text-sm uppercase tracking-wider text-slate-500 font-medium">
                            WhatsApp / MSG91 templates
                        </h2>
                        <div className="grid grid-cols-1 gap-3">
                            {TEMPLATE_FIELDS.map((t) => {
                                const row = findApp(t.title);
                                const draft = drafts[t.title];
                                const current = draft ?? row?.value ?? '';
                                const dirty = row ? current !== row.value : false;
                                const busy = savingTitle === t.title;
                                return (
                                    <div key={t.title} className="glass rounded-xl p-4">
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-white font-medium text-sm">{t.title}</h3>
                                                <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                                            </div>
                                            {!row && (
                                                <span className="text-xs text-amber-400 shrink-0">
                                                    Row missing
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={current}
                                                placeholder={t.placeholder}
                                                disabled={!row}
                                                onChange={(e) =>
                                                    setDrafts((prev) => ({ ...prev, [t.title]: e.target.value }))
                                                }
                                                className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
                                            />
                                            {dirty && (
                                                <button
                                                    onClick={() => saveAppSetting(t.title, current)}
                                                    disabled={busy}
                                                    className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/30 text-purple-200 hover:bg-purple-500/40 disabled:opacity-50"
                                                >
                                                    Save
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* ============================ Admin recipients ======================= */}
                    <section className="space-y-3">
                        <h2 className="text-sm uppercase tracking-wider text-slate-500 font-medium">
                            Admin recipients
                        </h2>
                        <div className="glass rounded-xl p-4 space-y-3">
                            <p className="text-xs text-slate-400">
                                Admins who receive admin-targeted WhatsApp/SMS (new signup, delivery-list alert).
                                Stored under <span className="font-mono text-slate-300">{ADMIN_PHONES_TITLE}</span>
                                {' '}as a JSON array; this editor keeps that shape consistent.
                            </p>
                            <div className="space-y-2">
                                {currentPhones.length === 0 && (
                                    <p className="text-xs text-slate-500">
                                        No admins yet. Add one below.
                                    </p>
                                )}
                                {currentPhones.map((p, idx) => (
                                    <div key={idx} className="grid grid-cols-12 gap-2">
                                        <input
                                            type="text"
                                            value={p.phone}
                                            placeholder="+919999000000"
                                            onChange={(e) => {
                                                const next = [...currentPhones];
                                                next[idx] = { ...next[idx], phone: e.target.value };
                                                setPhoneDraft(next);
                                            }}
                                            className="col-span-4 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white"
                                        />
                                        <input
                                            type="text"
                                            value={p.name ?? ''}
                                            placeholder="Name"
                                            onChange={(e) => {
                                                const next = [...currentPhones];
                                                next[idx] = { ...next[idx], name: e.target.value };
                                                setPhoneDraft(next);
                                            }}
                                            className="col-span-3 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white"
                                        />
                                        <input
                                            type="text"
                                            value={p.email ?? ''}
                                            placeholder="email (optional)"
                                            onChange={(e) => {
                                                const next = [...currentPhones];
                                                next[idx] = { ...next[idx], email: e.target.value };
                                                setPhoneDraft(next);
                                            }}
                                            className="col-span-4 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white"
                                        />
                                        <button
                                            onClick={() => {
                                                const next = currentPhones.filter((_, i) => i !== idx);
                                                setPhoneDraft(next);
                                            }}
                                            className="col-span-1 p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 flex items-center justify-center"
                                            title="Remove admin"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                                <button
                                    onClick={() => {
                                        const next = [...currentPhones, { phone: '', name: '', email: '' }];
                                        setPhoneDraft(next);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-800"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add admin
                                </button>
                                {phonesDirty && (
                                    <>
                                        <button
                                            onClick={handleSaveAdminPhones}
                                            disabled={savingPhones}
                                            className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/30 text-purple-200 hover:bg-purple-500/40 disabled:opacity-50"
                                        >
                                            {savingPhones ? 'Saving…' : 'Save changes'}
                                        </button>
                                        <button
                                            onClick={() => setPhoneDraft(null)}
                                            disabled={savingPhones}
                                            className="px-3 py-1.5 text-xs rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:text-white"
                                        >
                                            Discard
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

// ============================== sub-components ===============================

function KillSwitchCard({
    title,
    description,
    value,
    missing,
    saving,
    onToggle,
}: {
    title: string;
    description: string;
    value: string | undefined;
    missing: boolean;
    saving: boolean;
    onToggle: (next: boolean) => void;
}) {
    const enabled = isEnabled(value);
    return (
        <div className="glass rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-white font-semibold">{title}</h3>
                    {missing && (
                        <p className="text-xs text-amber-400 mt-0.5">Row missing</p>
                    )}
                </div>
                <button
                    onClick={() => onToggle(!enabled)}
                    disabled={saving || missing}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium shrink-0 disabled:opacity-50 ${enabled
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                        }`}
                >
                    {enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    {enabled ? 'Enabled' : 'Disabled'}
                </button>
            </div>
            <p className="text-sm text-slate-400">{description}</p>
        </div>
    );
}

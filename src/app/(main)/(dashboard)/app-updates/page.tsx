'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST, ApiError } from '@/lib/api';
import { Smartphone, ToggleLeft, ToggleRight, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

// Customer-app app_settings setting_id map — authoritative source is the
// production customer app's reader (swargcustomerapp home_page.dart): Android
// reads 2=min, 3=force, 7=enable; iOS reads 5=min, 6=force, 8=enable.
const CUSTOMER_IDS = {
    android: { minVersion: 2, forceUpdate: 3, enableUpdate: 7 },
    ios: { minVersion: 5, forceUpdate: 6, enableUpdate: 8 },
};

// Titles of the rows seeded by migration 015_app_update_tracking.sql.
const PUSH_TITLE = 'Customer App Update Push Title';
const PUSH_BODY = 'Customer App Update Push Body';
const DELIVERY_TITLES = {
    android: {
        minVersion: 'Delivery App Android Min Version',
        forceUpdate: 'Delivery App Android Force Update',
        enableUpdate: 'Delivery App Android Enable Update',
        storeUrl: 'Delivery App Android Store URL',
    },
    ios: {
        minVersion: 'Delivery App iOS Min Version',
        forceUpdate: 'Delivery App iOS Force Update',
        enableUpdate: 'Delivery App iOS Enable Update',
        storeUrl: 'Delivery App iOS Store URL',
    },
};

interface Setting {
    setting_id: number;
    title: string;
    value: string;
}

interface BroadcastLog {
    id: number;
    app: string;
    platform: string;
    min_version: string;
    devices_targeted: number;
    sent_at: string | null;
}

interface PlatformForm {
    minVersion: string;
    forceUpdate: boolean;
    enableUpdate: boolean;
    storeUrl: string;
}

const emptyPlatform = (): PlatformForm => ({
    minVersion: '',
    forceUpdate: false,
    enableUpdate: false,
    storeUrl: '',
});

const isFlagOn = (v: string | undefined) => v === '1';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <div>
            <label className="block text-sm text-slate-400 mb-1">{label}</label>
            <button
                type="button"
                onClick={() => onChange(!value)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl w-full ${
                    value ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}
            >
                {value ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                <span className="font-medium text-sm">{value ? 'On' : 'Off'}</span>
            </button>
        </div>
    );
}

function TextField({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-sm text-slate-400 mb-1">{label}</label>
            <input
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm"
            />
        </div>
    );
}

export default function AppUpdatesPage() {
    const queryClient = useQueryClient();

    const { data: settings = [], isLoading } = useQuery({
        queryKey: ['app-updates', 'settings'],
        queryFn: async () => (await GET<Setting[]>('/get_settings')).data || [],
    });

    const { data: broadcastLog = [] } = useQuery({
        queryKey: ['app-updates', 'broadcast-log'],
        queryFn: async () => (await GET<BroadcastLog[]>('/app_updates/broadcast_log')).data || [],
    });

    const [customerAndroid, setCustomerAndroid] = useState<PlatformForm>(emptyPlatform());
    const [customerIos, setCustomerIos] = useState<PlatformForm>(emptyPlatform());
    const [deliveryAndroid, setDeliveryAndroid] = useState<PlatformForm>(emptyPlatform());
    const [deliveryIos, setDeliveryIos] = useState<PlatformForm>(emptyPlatform());
    const [pushTitle, setPushTitle] = useState('');
    const [pushBody, setPushBody] = useState('');
    const [savingCustomer, setSavingCustomer] = useState(false);
    const [savingDelivery, setSavingDelivery] = useState(false);

    // Hydrate the form once settings are loaded.
    useEffect(() => {
        if (!settings.length) return;
        const byId = new Map<number, string>();
        const byTitle = new Map<string, string>();
        for (const s of settings) {
            byId.set(s.setting_id, s.value);
            byTitle.set(s.title, s.value);
        }
        setCustomerAndroid({
            minVersion: byId.get(CUSTOMER_IDS.android.minVersion) ?? '',
            forceUpdate: isFlagOn(byId.get(CUSTOMER_IDS.android.forceUpdate)),
            enableUpdate: isFlagOn(byId.get(CUSTOMER_IDS.android.enableUpdate)),
            storeUrl: '',
        });
        setCustomerIos({
            minVersion: byId.get(CUSTOMER_IDS.ios.minVersion) ?? '',
            forceUpdate: isFlagOn(byId.get(CUSTOMER_IDS.ios.forceUpdate)),
            enableUpdate: isFlagOn(byId.get(CUSTOMER_IDS.ios.enableUpdate)),
            storeUrl: '',
        });
        setPushTitle(byTitle.get(PUSH_TITLE) ?? '');
        setPushBody(byTitle.get(PUSH_BODY) ?? '');
        setDeliveryAndroid({
            minVersion: byTitle.get(DELIVERY_TITLES.android.minVersion) ?? '',
            forceUpdate: isFlagOn(byTitle.get(DELIVERY_TITLES.android.forceUpdate)),
            enableUpdate: isFlagOn(byTitle.get(DELIVERY_TITLES.android.enableUpdate)),
            storeUrl: byTitle.get(DELIVERY_TITLES.android.storeUrl) ?? '',
        });
        setDeliveryIos({
            minVersion: byTitle.get(DELIVERY_TITLES.ios.minVersion) ?? '',
            forceUpdate: isFlagOn(byTitle.get(DELIVERY_TITLES.ios.forceUpdate)),
            enableUpdate: isFlagOn(byTitle.get(DELIVERY_TITLES.ios.enableUpdate)),
            storeUrl: byTitle.get(DELIVERY_TITLES.ios.storeUrl) ?? '',
        });
    }, [settings]);

    const handleApiError = (error: unknown, fallback: string) => {
        if (error instanceof ApiError) {
            if (error.fieldErrors) {
                const msgs = Object.values(error.fieldErrors).flat();
                if (msgs.length) {
                    toast.error(msgs.join(' '));
                    return;
                }
            }
            toast.error(error.userMessage || fallback);
            return;
        }
        toast.error(error instanceof Error ? error.message : fallback);
    };

    const saveCustomer = async () => {
        setSavingCustomer(true);
        try {
            const result = await POST('/app_updates/customer', {
                platforms: {
                    android: {
                        min_version: customerAndroid.minVersion,
                        force_update: customerAndroid.forceUpdate,
                        enable_update: customerAndroid.enableUpdate,
                    },
                    ios: {
                        min_version: customerIos.minVersion,
                        force_update: customerIos.forceUpdate,
                        enable_update: customerIos.enableUpdate,
                    },
                },
                push_title: pushTitle,
                push_body: pushBody,
            });
            const broadcasts = (result as { broadcasts?: { platform: string; broadcasted: boolean; devices_targeted: number }[] }).broadcasts || [];
            const fired = broadcasts.filter((b) => b.broadcasted);
            if (fired.length) {
                const total = fired.reduce((n, b) => n + b.devices_targeted, 0);
                toast.success(`Customer app saved — update push sent to ${total} device(s)`);
            } else {
                toast.success('Customer app settings saved');
            }
            queryClient.invalidateQueries({ queryKey: ['app-updates'] });
        } catch (error) {
            handleApiError(error, 'Failed to save customer app settings');
        } finally {
            setSavingCustomer(false);
        }
    };

    const saveDelivery = async () => {
        setSavingDelivery(true);
        try {
            await POST('/app_updates/delivery', {
                platforms: {
                    android: {
                        min_version: deliveryAndroid.minVersion,
                        force_update: deliveryAndroid.forceUpdate,
                        enable_update: deliveryAndroid.enableUpdate,
                        store_url: deliveryAndroid.storeUrl,
                    },
                    ios: {
                        min_version: deliveryIos.minVersion,
                        force_update: deliveryIos.forceUpdate,
                        enable_update: deliveryIos.enableUpdate,
                        store_url: deliveryIos.storeUrl,
                    },
                },
            });
            toast.success('Delivery app settings saved');
            queryClient.invalidateQueries({ queryKey: ['app-updates'] });
        } catch (error) {
            handleApiError(error, 'Failed to save delivery app settings');
        } finally {
            setSavingDelivery(false);
        }
    };

    const renderPlatformPanel = (
        label: string,
        form: PlatformForm,
        setForm: (f: PlatformForm) => void,
        withStoreUrl: boolean,
    ) => (
        <div className="glass rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">{label}</h3>
            <TextField
                label="Minimum Version"
                value={form.minVersion}
                placeholder="e.g. 1.2.3"
                onChange={(v) => setForm({ ...form, minVersion: v })}
            />
            <div className="grid grid-cols-2 gap-3">
                <Toggle
                    label="Enable Update Check"
                    value={form.enableUpdate}
                    onChange={(v) => setForm({ ...form, enableUpdate: v })}
                />
                <Toggle
                    label="Force Update"
                    value={form.forceUpdate}
                    onChange={(v) => setForm({ ...form, forceUpdate: v })}
                />
            </div>
            {withStoreUrl && (
                <TextField
                    label="Store URL"
                    value={form.storeUrl}
                    placeholder="https://..."
                    onChange={(v) => setForm({ ...form, storeUrl: v })}
                />
            )}
        </div>
    );

    if (isLoading) {
        return <div className="text-slate-400 p-6">Loading…</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Smartphone className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">App Updates</h1>
                    <p className="text-slate-400">Manage version and force-update settings for the mobile apps</p>
                </div>
            </div>

            {/* Customer app */}
            <div className="glass rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-white">Customer App</h2>
                <div className="grid md:grid-cols-2 gap-4">
                    {renderPlatformPanel('Android', customerAndroid, setCustomerAndroid, false)}
                    {renderPlatformPanel('iOS', customerIos, setCustomerIos, false)}
                </div>
                <div className="glass rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-white">Update Notification Copy</h3>
                    <TextField label="Push Title" value={pushTitle} onChange={setPushTitle} />
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Push Body</label>
                        <textarea
                            value={pushBody}
                            onChange={(e) => setPushBody(e.target.value)}
                            rows={2}
                            className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm"
                        />
                    </div>
                </div>
                <p className="text-xs text-slate-500">
                    Turning Force Update on (with Enable Update on) sends an update push to outdated customer
                    devices — once per version. Customer-app store URLs are managed under Settings → Web App.
                </p>
                <button
                    onClick={saveCustomer}
                    disabled={savingCustomer}
                    className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                >
                    {savingCustomer ? 'Saving…' : 'Save Customer App'}
                </button>
            </div>

            {/* Delivery app */}
            <div className="glass rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-white">Delivery App</h2>
                <div className="grid md:grid-cols-2 gap-4">
                    {renderPlatformPanel('Android', deliveryAndroid, setDeliveryAndroid, true)}
                    {renderPlatformPanel('iOS', deliveryIos, setDeliveryIos, true)}
                </div>
                <p className="text-xs text-slate-500">
                    The delivery app enforces the update via a splash-screen block — no push is sent.
                </p>
                <button
                    onClick={saveDelivery}
                    disabled={savingDelivery}
                    className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                >
                    {savingDelivery ? 'Saving…' : 'Save Delivery App'}
                </button>
            </div>

            {/* Last broadcast */}
            <div className="glass rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-bold text-white">Last Broadcasts</h2>
                </div>
                {broadcastLog.length === 0 ? (
                    <p className="text-slate-500 text-sm">No update broadcasts yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 text-left">
                                    <th className="py-2 pr-4">App</th>
                                    <th className="py-2 pr-4">Platform</th>
                                    <th className="py-2 pr-4">Min Version</th>
                                    <th className="py-2 pr-4">Devices</th>
                                    <th className="py-2 pr-4">Sent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {broadcastLog.map((b) => (
                                    <tr key={b.id} className="border-t border-slate-800/50 text-slate-300">
                                        <td className="py-2 pr-4 capitalize">{b.app}</td>
                                        <td className="py-2 pr-4 capitalize">{b.platform}</td>
                                        <td className="py-2 pr-4">{b.min_version}</td>
                                        <td className="py-2 pr-4">{b.devices_targeted}</td>
                                        <td className="py-2 pr-4">
                                            {b.sent_at ? formatApiDate(b.sent_at, 'dd MMM yyyy HH:mm', 'N/A') : 'N/A'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

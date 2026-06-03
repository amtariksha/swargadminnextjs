'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import { Settings as SettingsIcon, Edit, ToggleLeft, ToggleRight, Clock, Smartphone, Bell } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { formatApiDate } from '@/lib/dateUtils';
// Rows hidden from the General Settings table because a dedicated screen
// already owns them. Surfacing the same row twice creates a confusing
// second edit-surface — value can drift visually between paints, and the
// operator can't tell which page is canonical. All the rows still live in
// the same `app_settings` table; this is purely a display filter.

// Owned by /settings/automation. Keep in sync with CRON_JOBS there.
const AUTOMATION_TITLES = new Set<string>([
    'Auto-Generate Delivery List',
    'Auto-Generate Delivery List Time',
    'Low Balance Reminder Enabled',
    'Low Balance Reminder Time',
    'Daytime Incentive Enabled',
    'Daytime Incentive Run Time',
    'Dispatch Broadcasts Enabled',
    'Daily DB Backup Enabled',
    'Daily DB Backup Time',
]);

// Owned by /app-updates. Two Customer App push-copy rows + the eight
// Delivery App Android/iOS version-control rows.
const APP_UPDATE_TITLES = new Set<string>([
    'Customer App Update Push Title',
    'Customer App Update Push Body',
    'Delivery App Android Min Version',
    'Delivery App Android Force Update',
    'Delivery App Android Enable Update',
    'Delivery App Android Store URL',
    'Delivery App iOS Min Version',
    'Delivery App iOS Force Update',
    'Delivery App iOS Enable Update',
    'Delivery App iOS Store URL',
]);

// Owned by /settings/notifications. Master switches + MSG91/WhatsApp
// template names + the admin-recipients JSON. Keep this in sync with the
// constants in src/app/(dashboard)/settings/notifications/page.tsx.
const NOTIFICATION_TITLES = new Set<string>([
    'Send Email',
    'Order Delivery Template',
    'Partial Delivery',
    'Delivery List Admin Alert',
    'Low Balance',
    'Daytime Payment Template',
    'Daytime Order Placed Template',
    'Daytime Order Picked Template',
    'Daytime Order Delivered Template',
    'Daytime Payment Reminder Template',
    'New User Registered Admin',
    'Admin Phone Numbers',
]);

// Owned by a dedicated screen that stores its config in a SINGLE app_settings
// row (structured JSON / a mode flag), not a flat value the operator should
// edit as a raw blob here. Surfacing it in General too exposes a second
// edit-surface that can silently clobber the structured editor's value.
//   * refund_reasons        → /settings/refund-reasons (structured JSON editor)
//   * packaging_refund_mode → packaging refund-mode toggle (backend
//                             /packaging/refund_mode)
const DEDICATED_PAGE_TITLES = new Set<string>([
    'refund_reasons',
    'packaging_refund_mode',
]);

const MANAGED_ELSEWHERE = new Set<string>([
    ...AUTOMATION_TITLES,
    ...APP_UPDATE_TITLES,
    ...NOTIFICATION_TITLES,
    ...DEDICATED_PAGE_TITLES,
]);

interface Setting {
    setting_id: number;
    id?: number;
    title: string;
    value: string;
    updated_at?: string;
}

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<Setting | null>(null);
    const [newValue, setNewValue] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: allSettings = [], isLoading } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const response = await GET<Setting[]>('/get_settings');
            // Add id field for DataTable
            return (response.data || []).map(s => ({ ...s, id: s.setting_id }));
        },
    });

    // Hide rows owned by a dedicated screen (cron settings on /settings/automation,
    // app-update settings on /app-updates). All still in the same app_settings
    // table — this is purely a display filter to avoid a second edit-surface
    // for the same value.
    const settings = allSettings.filter((s) => !MANAGED_ELSEWHERE.has(s.title));

    const handleEdit = (item: Setting) => {
        setEditItem(item);
        setNewValue(item.value);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editItem) return;
        setIsSubmitting(true);
        try {
            await POST('/update_settings', {
                setting_id: editItem.setting_id,
                value: newValue,
            });
            setShowModal(false);
            setEditItem(null);
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update setting');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isBoolean = (value: string) => value === '0' || value === '1';

    const columns: Column<Setting>[] = [
        {
            key: 'actions',
            header: 'Update',
            width: '70px',
            render: (item) => (
                <button
                    onClick={() => handleEdit(item)}
                    className="p-2 hover:bg-slate-800/50 rounded-lg"
                    title="Edit"
                >
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        { key: 'setting_id', header: 'ID', width: '60px' },
        {
            key: 'title',
            header: 'Title',
            render: (item) => <span className="text-white font-medium">{item.title}</span>,
        },
        {
            key: 'value',
            header: 'Value',
            render: (item) => {
                if (item.value === '0') return <span className="text-red-400">False</span>;
                if (item.value === '1') return <span className="text-green-400">True</span>;
                return <span className="text-slate-300">{item.value}</span>;
            },
        },
        {
            key: 'updated_at',
            header: 'Updated',
            render: (item) => (
                <span className="text-slate-400 text-sm">
                    {item.updated_at ? formatApiDate(item.updated_at, 'dd MMM yyyy HH:mm:ss', 'N/A') : 'N/A'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <SettingsIcon className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">General Settings</h1>
                    <p className="text-slate-400">Manage application settings</p>
                </div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <Link
                        href="/settings/automation"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                        <Clock className="w-4 h-4 text-purple-300" />
                        Cron / Automation
                    </Link>
                    <Link
                        href="/settings/notifications"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                        <Bell className="w-4 h-4 text-purple-300" />
                        Notifications &amp; Templates
                    </Link>
                    <Link
                        href="/app-updates"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                        <Smartphone className="w-4 h-4 text-purple-300" />
                        App Updates
                    </Link>
                </div>
            </div>

            <DataTable data={settings} columns={columns} loading={isLoading} searchPlaceholder="Search settings..." />

            {showModal && editItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Update Setting</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Setting ID</label>
                                <input
                                    type="text"
                                    value={editItem.setting_id}
                                    disabled
                                    className="w-full px-4 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Title</label>
                                <input
                                    type="text"
                                    value={editItem.title}
                                    disabled
                                    className="w-full px-4 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Value</label>
                                {isBoolean(editItem.value) ? (
                                    <button
                                        type="button"
                                        onClick={() => setNewValue(newValue === '1' ? '0' : '1')}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full ${newValue === '1' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                            }`}
                                    >
                                        {newValue === '1' ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                        <span className="font-medium">{newValue === '1' ? 'True' : 'False'}</span>
                                    </button>
                                ) : (
                                    <input
                                        type="text"
                                        value={newValue}
                                        onChange={(e) => setNewValue(e.target.value)}
                                        className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                                    />
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Updating...' : 'Update'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

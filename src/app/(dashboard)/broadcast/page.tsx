'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST, ApiError } from '@/lib/api';
import { Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';
import CustomerMultiSelect from '@/components/CustomerMultiSelect';
import { useDrivers } from '@/hooks/useData';

// The 6 Feature-08 categories — broadcasts respect each customer's
// per-category preference for the chosen category.
const CATEGORIES = [
    { value: 'promotions', label: 'Promotions & offers' },
    { value: 'order', label: 'Order updates' },
    { value: 'delivery', label: 'Delivery updates' },
    { value: 'wallet', label: 'Wallet updates' },
    { value: 'low_balance', label: 'Low balance alerts' },
    { value: 'partial_delivery', label: 'Partial delivery' },
];

type AudienceType = 'all' | 'custom' | 'pincode' | 'driver';

interface BroadcastRow {
    id: number;
    title: string;
    audience_type: string;
    status: string;
    category: string;
    scheduled_at: string | null;
    sent_at: string | null;
    recipient_count: number | null;
    created_at: string | null;
}

export default function BroadcastPage() {
    const queryClient = useQueryClient();

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [deepLink, setDeepLink] = useState('');
    const [category, setCategory] = useState('promotions');
    const [audienceType, setAudienceType] = useState<AudienceType>('all');
    const [userIds, setUserIds] = useState<number[]>([]);
    const [pincode, setPincode] = useState('');
    const [driverUserId, setDriverUserId] = useState<number | ''>('');
    const { data: drivers = [], isLoading: driversLoading } = useDrivers();
    const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
    const [scheduledAt, setScheduledAt] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    const { data: broadcasts = [], isLoading } = useQuery({
        queryKey: ['broadcasts'],
        queryFn: async () => (await GET<BroadcastRow[]>('/broadcast')).data || [],
    });

    const resetForm = () => {
        setTitle('');
        setBody('');
        setImageUrl(null);
        setDeepLink('');
        setCategory('promotions');
        setAudienceType('all');
        setUserIds([]);
        setPincode('');
        setDriverUserId('');
        setScheduleMode('now');
        setScheduledAt('');
    };

    const handleImageUpload = async (file: File) => {
        setUploadingImage(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await POST<{ image_url: string }>(
                '/broadcast/upload_image',
                fd,
            );
            setImageUrl(res.data?.image_url || null);
            toast.success('Image uploaded');
        } catch (error) {
            toast.error(
                error instanceof ApiError ? error.userMessage : 'Image upload failed',
            );
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSubmit = async () => {
        if (!title.trim() || !body.trim()) {
            toast.error('Title and message are required');
            return;
        }
        if (audienceType === 'custom' && userIds.length === 0) {
            toast.error('Select at least one customer');
            return;
        }
        if (audienceType === 'pincode' && !pincode.trim()) {
            toast.error('Enter a pincode');
            return;
        }
        if (audienceType === 'driver' && !driverUserId) {
            toast.error('Select a delivery driver');
            return;
        }
        if (scheduleMode === 'scheduled' && !scheduledAt) {
            toast.error('Pick a date and time to schedule');
            return;
        }

        setSubmitting(true);
        try {
            const payload: Record<string, unknown> = {
                title: title.trim(),
                body: body.trim(),
                category,
                audience_type: audienceType,
            };
            if (imageUrl) payload.image_url = imageUrl;
            if (deepLink.trim()) payload.deep_link = deepLink.trim();
            if (audienceType === 'custom') payload.user_ids = userIds;
            if (audienceType === 'pincode') payload.pincode = Number(pincode);
            if (audienceType === 'driver') payload.driver_user_id = Number(driverUserId);
            if (scheduleMode === 'scheduled') payload.scheduled_at = scheduledAt;

            const res = await POST('/broadcast', payload);
            toast.success(res.message || 'Broadcast created');
            resetForm();
            queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.userMessage
                    : 'Failed to create broadcast',
            );
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass =
        'w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm';

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Megaphone className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Broadcast</h1>
                    <p className="text-slate-400">
                        Send an announcement to customers — in-app bell + push.
                        Each customer&apos;s per-category preference is respected.
                    </p>
                </div>
            </div>

            {/* Composer */}
            <div className="glass rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-white">Compose</h2>

                <div>
                    <label className="block text-sm text-slate-400 mb-1">Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={inputClass}
                        placeholder="Notification title"
                    />
                </div>

                <div>
                    <label className="block text-sm text-slate-400 mb-1">Message</label>
                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={3}
                        className={inputClass}
                        placeholder="Notification body"
                    />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">
                            Category
                        </label>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className={inputClass}
                        >
                            {CATEGORIES.map((c) => (
                                <option key={c.value} value={c.value}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">
                            Deep link (optional)
                        </label>
                        <input
                            type="text"
                            value={deepLink}
                            onChange={(e) => setDeepLink(e.target.value)}
                            className={inputClass}
                            placeholder="/WalletNewPage"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-slate-400 mb-1">
                        Image (optional)
                    </label>
                    {imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={imageUrl}
                            alt="Broadcast"
                            className="w-full h-40 object-cover rounded-xl border border-slate-700/50 mb-2"
                        />
                    )}
                    <ImageUpload onUpload={handleImageUpload} />
                    {uploadingImage && (
                        <p className="text-xs text-purple-400 mt-1">Uploading…</p>
                    )}
                </div>
            </div>

            {/* Audience */}
            <div className="glass rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-white">Audience</h2>
                <div className="flex flex-wrap gap-4">
                    {([
                        ['all', 'All customers'],
                        ['custom', 'Specific customers'],
                        ['pincode', 'By pincode'],
                        ['driver', 'By delivery driver'],
                    ] as [AudienceType, string][]).map(([val, label]) => (
                        <label
                            key={val}
                            className="flex items-center gap-2 text-sm text-white cursor-pointer"
                        >
                            <input
                                type="radio"
                                name="audience"
                                checked={audienceType === val}
                                onChange={() => setAudienceType(val)}
                            />
                            {label}
                        </label>
                    ))}
                </div>

                {audienceType === 'custom' && (
                    <CustomerMultiSelect value={userIds} onChange={setUserIds} />
                )}
                {audienceType === 'pincode' && (
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">
                            Pincode
                        </label>
                        <input
                            type="number"
                            value={pincode}
                            onChange={(e) => setPincode(e.target.value)}
                            className={inputClass}
                            placeholder="e.g. 560001"
                        />
                    </div>
                )}
                {audienceType === 'driver' && (
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">
                            Delivery driver
                        </label>
                        <select
                            value={driverUserId === '' ? '' : String(driverUserId)}
                            onChange={(e) =>
                                setDriverUserId(e.target.value ? Number(e.target.value) : '')
                            }
                            className={inputClass}
                            disabled={driversLoading}
                        >
                            <option value="">
                                {driversLoading ? 'Loading drivers…' : 'Choose a driver'}
                            </option>
                            {drivers.map((d) => (
                                <option key={`${d.role_id}-${d.id}`} value={d.user_id ?? d.id}>
                                    {d.name || `#${d.id}`}
                                    {d.role_label ? ` · ${d.role_label}` : ''}
                                    {d.phone ? ` · ${d.phone}` : ''}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">
                            Targets every customer currently assigned to the selected
                            driver via their most-recent order assignment.
                        </p>
                    </div>
                )}
            </div>

            {/* Schedule */}
            <div className="glass rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-white">Schedule</h2>
                <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                        <input
                            type="radio"
                            name="schedule"
                            checked={scheduleMode === 'now'}
                            onChange={() => setScheduleMode('now')}
                        />
                        Send immediately
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                        <input
                            type="radio"
                            name="schedule"
                            checked={scheduleMode === 'scheduled'}
                            onChange={() => setScheduleMode('scheduled')}
                        />
                        Schedule for later
                    </label>
                </div>
                {scheduleMode === 'scheduled' && (
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">
                            Date &amp; time (IST)
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                )}
                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                >
                    {submitting
                        ? 'Sending…'
                        : scheduleMode === 'scheduled'
                          ? 'Schedule broadcast'
                          : 'Send broadcast'}
                </button>
            </div>

            {/* History */}
            <div className="glass rounded-2xl p-6 space-y-3">
                <h2 className="text-lg font-bold text-white">Recent broadcasts</h2>
                {isLoading ? (
                    <p className="text-slate-400">Loading…</p>
                ) : broadcasts.length === 0 ? (
                    <p className="text-slate-500 text-sm">No broadcasts yet.</p>
                ) : (
                    <div className="space-y-2">
                        {broadcasts.map((b) => (
                            <div
                                key={b.id}
                                className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl"
                            >
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        {b.title}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {b.audience_type} · {b.category}
                                        {b.recipient_count != null
                                            ? ` · ${b.recipient_count} recipients`
                                            : ''}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs px-2 py-1 rounded-lg bg-slate-700/50 text-slate-200">
                                        {b.status}
                                    </span>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {b.sent_at || b.scheduled_at || b.created_at || ''}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

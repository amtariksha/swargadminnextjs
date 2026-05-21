'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST, ApiError } from '@/lib/api';
import { Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';

interface NotificationImageRow {
    scenario: string;
    label: string;
    category: string;
    image_url: string | null;
    updated_at: string | null;
}

/**
 * Feature 09 — notification image library.
 *
 * One default image per notification scenario, swappable any time. Stored
 * in R2 by the backend. Gated by the existing `notifications` permission
 * key (the page lives under /notifications/images).
 */
export default function NotificationImagesPage() {
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState<string | null>(null);

    const { data: images = [], isLoading } = useQuery({
        queryKey: ['notification-images'],
        queryFn: async () =>
            (await GET<NotificationImageRow[]>('/notification_images')).data || [],
    });

    const handleUpload = async (scenario: string, file: File) => {
        setUploading(scenario);
        try {
            const fd = new FormData();
            fd.append('scenario', scenario);
            fd.append('image', file);
            await POST('/notification_images', fd);
            toast.success('Notification image updated');
            queryClient.invalidateQueries({ queryKey: ['notification-images'] });
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.userMessage
                    : 'Failed to upload image',
            );
        } finally {
            setUploading(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <ImageIcon className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">
                        Notification Images
                    </h1>
                    <p className="text-slate-400">
                        The default image shown for each notification scenario.
                        Triggered notifications use these images.
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="text-slate-400 p-6">Loading…</div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {images.map((row) => (
                        <div
                            key={row.scenario}
                            className="glass rounded-2xl p-4 space-y-3"
                        >
                            <div>
                                <h3 className="text-sm font-semibold text-white">
                                    {row.label}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {row.scenario} · {row.category}
                                </p>
                            </div>

                            {row.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={row.image_url}
                                    alt={row.label}
                                    className="w-full h-36 object-cover rounded-xl border border-slate-700/50"
                                />
                            ) : (
                                <div className="w-full h-36 flex items-center justify-center rounded-xl border border-dashed border-slate-700/50 text-xs text-slate-500">
                                    No image set
                                </div>
                            )}

                            <ImageUpload
                                onUpload={(file) => handleUpload(row.scenario, file)}
                            />
                            {uploading === row.scenario && (
                                <p className="text-xs text-purple-400">Uploading…</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

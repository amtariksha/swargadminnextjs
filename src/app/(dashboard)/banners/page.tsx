'use client';

import { useState, useRef } from 'react';
import { useBanners, Banner } from '@/hooks/useData';
import { Image as ImageIcon, Trash2, Plus, Upload } from 'lucide-react';
import { POST, DELETE } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

const IMAGE_BASE_URL = 'https://node.desicowmilk.com/public/uploads/images';

export default function BannersPage() {
    const { data: banners = [], isLoading } = useBanners();
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size / 1024 > 3072) {
            alert('File size must be less than 3MB');
            return;
        }

        const formData = new FormData();
        formData.append('image', file);
        formData.append('image_type', '1'); // Mobile banner

        setUploading(true);
        try {
            await POST('/upload_banner_image', formData as unknown as Record<string, unknown>);
            queryClient.invalidateQueries({ queryKey: ['banners'] });
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Failed to upload banner');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this banner?')) return;
        setDeleting(id);
        try {
            await POST('/delete_banner_image', { id });
            queryClient.invalidateQueries({ queryKey: ['banners'] });
        } catch (error) {
            console.error('Delete failed:', error);
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Banner Images</h1>
                    <p className="text-slate-400">Upload or delete banner images</p>
                </div>
            </div>

            <div className="glass rounded-2xl p-6">
                <h3 className="text-lg font-medium text-white mb-4">Mobile App Banners</h3>
                <p className="text-slate-400 text-sm mb-6">Maximum 5 banners allowed. Images should be less than 3MB.</p>

                {isLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="aspect-video bg-slate-800/50 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {banners.slice(0, 5).map((banner) => (
                            <div key={banner.id} className="relative group aspect-video bg-slate-800 rounded-xl overflow-hidden">
                                <img
                                    src={`${IMAGE_BASE_URL}/${banner.image}`}
                                    alt="Banner"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = '/placeholder.png';
                                    }}
                                />
                                <button
                                    onClick={() => handleDelete(banner.id)}
                                    disabled={deleting === banner.id}
                                    className="absolute top-2 right-2 p-2 bg-red-500/90 hover:bg-red-600 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    {deleting === banner.id ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Trash2 className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        ))}

                        {banners.length < 5 && (
                            <label className="aspect-video bg-slate-800/30 border-2 border-dashed border-slate-700/50 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/50 transition-colors">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".png,.jpg,.jpeg"
                                    onChange={handleUpload}
                                    className="hidden"
                                    disabled={uploading}
                                />
                                {uploading ? (
                                    <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Upload className="w-8 h-8 text-slate-500 mb-2" />
                                        <span className="text-sm text-slate-400">Upload</span>
                                    </>
                                )}
                            </label>
                        )}
                    </div>
                )}

                {banners.length === 0 && !isLoading && (
                    <div className="text-center py-8">
                        <ImageIcon className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                        <p className="text-slate-400">No banners uploaded yet</p>
                    </div>
                )}
            </div>
        </div>
    );
}

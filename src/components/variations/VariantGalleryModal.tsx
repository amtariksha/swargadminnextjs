'use client';

/**
 * Variant gallery modal — manages per-variant image uploads
 * (Phase-3 polish / D2 from the variations plan).
 *
 * Backed by the polymorphic `images` table (table_name='variant'). image_type=1
 * is the featured image (kept in sync with variant.image_url for the
 * storefront's fast single-image read); image_type=2..N is the gallery.
 *
 * Mirrors the product slider image pattern in /products/[id]/page.tsx —
 * file input, upload via multipart, list + delete with confirmation.
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Trash2, X, Star, Image as ImageIcon } from 'lucide-react';
import Modal from '@/components/Modal';
import apiClient, { ApiError } from '@/lib/api';
import { IMAGE_BASE_URL } from '@/config/tenant';

interface VariantImage {
    id: number;
    table_name: string;
    table_id: number;
    image_type: number;
    image: string;
    created_at?: string;
    updated_at?: string;
}

interface VariantGalleryModalProps {
    productId: number;
    variantId: number;
    variantLabel: string;
    onClose: () => void;
}

export default function VariantGalleryModal({
    productId,
    variantId,
    variantLabel,
    onClose,
}: VariantGalleryModalProps) {
    const [images, setImages] = useState<VariantImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const featuredFileRef = useRef<HTMLInputElement>(null);
    const galleryFileRef = useRef<HTMLInputElement>(null);

    const featured = images.find((i) => i.image_type === 1);
    const gallery = images.filter((i) => i.image_type !== 1);
    const galleryCap = 6; // matches product slider cap

    const refresh = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get<{ data: VariantImage[] }>(
                `/products/${productId}/variants/${variantId}/images`,
            );
            setImages(res.data.data || []);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Failed to load images');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variantId]);

    const upload = async (file: File, imageType: 1 | 2) => {
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be 5 MB or smaller');
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            fd.append('image_type', String(imageType));
            await apiClient.post(`/products/${productId}/variants/${variantId}/images`, fd);
            toast.success(imageType === 1 ? 'Featured image updated' : 'Image added to gallery');
            await refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const remove = async (imageId: number) => {
        try {
            await apiClient.delete(`/products/${productId}/variants/${variantId}/images/${imageId}`);
            toast.success('Image deleted');
            await refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Delete failed');
        }
    };

    return (
        <Modal isOpen onClose={onClose} title={`Gallery · ${variantLabel}`}>
            <div className="space-y-5">
                {/* Featured image */}
                <section>
                    <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-amber-400" /> Featured image
                    </h4>
                    {featured ? (
                        <div className="relative inline-block">
                            <img src={`${IMAGE_BASE_URL}/${featured.image}`} alt="Featured"
                                className="w-32 h-32 rounded-xl object-cover border border-slate-700" />
                            <button type="button" onClick={() => remove(featured.id)}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600">
                                <X className="w-3 h-3 text-white" />
                            </button>
                        </div>
                    ) : (
                        <div>
                            <input ref={featuredFileRef} type="file" accept="image/*"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) upload(f, 1);
                                    if (featuredFileRef.current) featuredFileRef.current.value = '';
                                }}
                                className="hidden" />
                            <button type="button" disabled={uploading}
                                onClick={() => featuredFileRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border border-dashed border-slate-700/50 rounded-xl text-sm text-slate-400 hover:text-white hover:border-purple-500/50">
                                <Upload className="w-4 h-4" /> Upload featured (max 5 MB)
                            </button>
                        </div>
                    )}
                </section>

                {/* Gallery */}
                <section>
                    <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5 text-purple-400" /> Gallery
                        <span className="text-slate-500 text-xs ml-1">({gallery.length}/{galleryCap})</span>
                    </h4>
                    {loading ? (
                        <div className="text-slate-500 text-sm">Loading…</div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                            {gallery.map((img) => (
                                <div key={img.id} className="relative">
                                    <img src={`${IMAGE_BASE_URL}/${img.image}`} alt=""
                                        className="w-full h-24 rounded-lg object-cover border border-slate-700" />
                                    <button type="button" onClick={() => remove(img.id)}
                                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600">
                                        <Trash2 className="w-3 h-3 text-white" />
                                    </button>
                                </div>
                            ))}
                            {gallery.length < galleryCap && (
                                <button type="button" disabled={uploading}
                                    onClick={() => galleryFileRef.current?.click()}
                                    className="h-24 flex items-center justify-center bg-slate-800/50 border border-dashed border-slate-700/50 rounded-lg text-sm text-slate-400 hover:text-white hover:border-purple-500/50">
                                    <Upload className="w-4 h-4 mr-1" /> Add
                                </button>
                            )}
                        </div>
                    )}
                    <input ref={galleryFileRef} type="file" accept="image/*"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) upload(f, 2);
                            if (galleryFileRef.current) galleryFileRef.current.value = '';
                        }}
                        className="hidden" />
                </section>

                <div className="flex justify-end pt-2">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
}

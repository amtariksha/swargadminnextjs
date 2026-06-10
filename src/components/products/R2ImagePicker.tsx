'use client';

import { useRef, useState } from 'react';
import { POST } from '@/lib/api';
import { IMAGE_BASE_URL } from '@/config/tenant';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';

interface R2ImagePickerProps {
    /** Bare R2 filenames (what gets stored in the product columns / join table). */
    value: string[];
    onChange: (filenames: string[]) => void;
    /** Omit for an unlimited gallery; pass 1 for a single image (meta/og/banner). */
    max?: number;
}

/**
 * Uploads images to R2 via /upload_image_only (returns a bare filename, no
 * legacy images-table row) and manages an ordered list of those filenames.
 * Used by the product form for meta_image/og_image (max=1) and the gallery.
 * Stored value stays the bare filename; preview = IMAGE_BASE_URL + filename.
 */
export default function R2ImagePicker({ value, onChange, max }: R2ImagePickerProps) {
    const ref = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const atMax = max != null && value.length >= max;

    const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setBusy(true);
        try {
            const added: string[] = [];
            for (const file of files) {
                if (file.size > 5 * 1024 * 1024) {
                    toast.error(`${file.name} exceeds 5MB`);
                    continue;
                }
                const fd = new FormData();
                fd.append('image', file);
                const res = (await POST<unknown>('/upload_image_only', fd)) as unknown as {
                    file?: string;
                    data?: { file?: string };
                };
                const filename = res?.file ?? res?.data?.file;
                if (filename) added.push(filename);
            }
            if (added.length > 0) {
                const next = max === 1 ? added.slice(-1) : [...value, ...added];
                onChange(max != null ? next.slice(0, max) : next);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Image upload failed');
        } finally {
            setBusy(false);
            if (ref.current) ref.current.value = '';
        }
    };

    const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

    return (
        <div className="space-y-2">
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {value.map((filename, i) => (
                        <div key={`${filename}-${i}`} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`${IMAGE_BASE_URL}/${filename}`}
                                alt=""
                                className="w-20 h-20 object-cover rounded-lg border border-slate-700/50"
                            />
                            <button
                                type="button"
                                onClick={() => removeAt(i)}
                                aria-label="Remove image"
                                className="absolute -top-2 -right-2 bg-slate-900 border border-slate-600 rounded-full p-0.5"
                            >
                                <X className="w-3 h-3 text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {!atMax && (
                <>
                    <input
                        ref={ref}
                        type="file"
                        accept="image/*"
                        multiple={max !== 1}
                        onChange={handleFiles}
                        className="hidden"
                    />
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => ref.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                        <Upload className="w-4 h-4" />
                        {busy ? 'Uploading…' : value.length > 0 ? 'Add image' : 'Upload image'}
                    </button>
                </>
            )}
        </div>
    );
}

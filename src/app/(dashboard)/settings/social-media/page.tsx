'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import { IMAGE_BASE_URL } from '@/config/tenant';
import DataTable, { Column } from '@/components/DataTable';
import { Trash2, Plus, ExternalLink, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface SocialMedia {
    id: number;
    title: string;
    url: string;
    image?: string;
    created_at?: string;
    updated_at?: string;
}

export default function SocialMediaPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ title: '', url: '' });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Delete dialog state
    const [deleteTarget, setDeleteTarget] = useState<SocialMedia | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const { data: socialMedia = [], isLoading } = useQuery({
        queryKey: ['social-media'],
        queryFn: async () => {
            const response = await GET<SocialMedia[]>('/get_social_media');
            return response.data || [];
        },
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!imageFile) {
            toast.error('Please select an image');
            return;
        }
        setIsSubmitting(true);
        try {
            const uploadFormData = new FormData();
            uploadFormData.append('image', imageFile);
            const uploadRes = await POST<{ file: string }>('/upload_image_only', uploadFormData as unknown as Record<string, unknown>);

            await POST('/add_social_media', {
                title: formData.title,
                url: formData.url,
                image: (uploadRes as unknown as { file: string }).file,
            });

            toast.success('Social media added');
            setShowModal(false);
            setFormData({ title: '', url: '' });
            setImageFile(null);
            setImagePreview('');
            queryClient.invalidateQueries({ queryKey: ['social-media'] });
        } catch {
            toast.error('Failed to add social media');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await POST('/delete_social_media', { id: deleteTarget.id });
            toast.success('Deleted successfully');
            setDeleteTarget(null);
            queryClient.invalidateQueries({ queryKey: ['social-media'] });
        } catch {
            toast.error('Failed to delete');
        } finally {
            setIsDeleting(false);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const columns: Column<SocialMedia>[] = [
        { key: 'id', header: 'ID', width: '60px' },
        { key: 'title', header: 'Title' },
        {
            key: 'url',
            header: 'URL',
            render: (item) => (
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:underline">
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[220px]">{item.url}</span>
                </a>
            ),
        },
        {
            key: 'image',
            header: 'Image',
            width: '80px',
            sortable: false,
            render: (item) => item.image ? (
                <img src={`${IMAGE_BASE_URL}/${item.image}`} alt={item.title} className="w-10 h-10 object-cover rounded" />
            ) : (
                <div className="w-10 h-10 bg-slate-700 rounded flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-slate-500" />
                </div>
            ),
        },
        {
            key: 'updated_at',
            header: 'Last Update',
            width: '140px',
            render: (item) => <span className="text-slate-400 text-sm">{formatDate(item.updated_at || item.created_at)}</span>,
        },
        {
            key: 'actions',
            header: 'Delete',
            width: '70px',
            sortable: false,
            render: (item) => (
                <button onClick={() => setDeleteTarget(item)} className="p-2 hover:bg-red-500/10 rounded-lg text-red-400">
                    <Trash2 className="w-4 h-4" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Social Media</h1>
                    <p className="text-slate-400">Manage social media links</p>
                </div>
                <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:opacity-90 transition-opacity">
                    <Plus className="w-5 h-5" />Add Social Media
                </button>
            </div>

            <DataTable data={socialMedia} columns={columns} loading={isLoading} searchPlaceholder="Search social media..." />

            {/* Add Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <h2 className="text-lg font-semibold text-white">Add Social Media</h2>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-700 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
                                <input type="text" required value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="e.g. Facebook" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">URL *</label>
                                <input type="url" required value={formData.url}
                                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="https://facebook.com/..." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Icon Image *</label>
                                <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (file.size > 2 * 1024 * 1024) {
                                            toast.error('File must be less than 2MB');
                                            return;
                                        }
                                        setImageFile(file);
                                        setImagePreview(URL.createObjectURL(file));
                                    }}
                                    className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500/20 file:text-purple-400 hover:file:bg-purple-500/30" />
                                {imagePreview && (
                                    <img src={imagePreview} alt="Preview" className="mt-2 w-16 h-16 object-cover rounded" />
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button"
                                    onClick={() => { setShowModal(false); setImageFile(null); setImagePreview(''); }}
                                    className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {isSubmitting ? 'Adding...' : 'Add'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-white mb-2">Delete Social Media</h3>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete <span className="text-white font-medium">{deleteTarget.title}</span>?
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteTarget(null)}
                                className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800">
                                Cancel
                            </button>
                            <button onClick={handleDelete} disabled={isDeleting}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

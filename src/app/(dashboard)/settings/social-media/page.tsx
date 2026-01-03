'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import { Share2, Trash2, Plus, ExternalLink } from 'lucide-react';

const IMAGE_BASE_URL = 'https://node.desicowmilk.com/public/uploads/images';

interface SocialMedia {
    id: number;
    title: string;
    url: string;
    image?: string;
    created_at?: string;
}

export default function SocialMediaPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ title: '', url: '' });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            alert('Please select an image');
            return;
        }
        setIsSubmitting(true);
        try {
            // Upload image first
            const uploadFormData = new FormData();
            uploadFormData.append('image', imageFile);
            const uploadRes = await POST<{ file: string }>('/upload_image_only', uploadFormData as unknown as Record<string, unknown>);

            // Add social media
            await POST('/add_social_media', {
                title: formData.title,
                url: formData.url,
                image: (uploadRes as unknown as { file: string }).file,
            });

            setShowModal(false);
            setFormData({ title: '', url: '' });
            setImageFile(null);
            setImagePreview('');
            queryClient.invalidateQueries({ queryKey: ['social-media'] });
        } catch (error) {
            console.error('Failed:', error);
            alert('Failed to add social media');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this social media link?')) return;
        try {
            await POST('/delete_social_media', { id });
            queryClient.invalidateQueries({ queryKey: ['social-media'] });
        } catch (error) {
            console.error('Delete failed:', error);
        }
    };

    const columns: Column<SocialMedia>[] = [
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'title',
            header: 'Title',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-purple-400" />
                    <span className="text-white font-medium">{item.title}</span>
                </div>
            ),
        },
        {
            key: 'url',
            header: 'URL',
            render: (item) => (
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:underline"
                >
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate max-w-xs">{item.url}</span>
                </a>
            ),
        },
        {
            key: 'image',
            header: 'Image',
            render: (item) => item.image ? (
                <img
                    src={`${IMAGE_BASE_URL}/${item.image}`}
                    alt={item.title}
                    className="w-10 h-10 object-cover rounded"
                />
            ) : <span className="text-slate-500">-</span>,
        },
        {
            key: 'created_at',
            header: 'Created',
            render: (item) => (
                <span className="text-slate-400 text-sm">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Delete',
            width: '80px',
            render: (item) => (
                <button onClick={() => handleDelete(item.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-red-400">
                    <Trash2 className="w-4 h-4" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Social Media Links</h1>
                    <p className="text-slate-400">Manage social media profiles</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium"
                >
                    <Plus className="w-5 h-5" />Add Social Media
                </button>
            </div>

            <DataTable data={socialMedia} columns={columns} loading={isLoading} searchPlaceholder="Search social media..." />

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Add Social Media</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Title</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                                    placeholder="e.g. Facebook"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">URL</label>
                                <input
                                    type="url"
                                    value={formData.url}
                                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                                    placeholder="https://facebook.com/..."
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Icon Image</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".png,.jpg,.jpeg"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            if (file.size > 2 * 1024 * 1024) {
                                                alert('File must be less than 2MB');
                                                return;
                                            }
                                            setImageFile(file);
                                            setImagePreview(URL.createObjectURL(file));
                                        }
                                    }}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white"
                                />
                                {imagePreview && (
                                    <img src={imagePreview} alt="Preview" className="mt-2 w-16 h-16 object-cover rounded" />
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); setImageFile(null); setImagePreview(''); }}
                                    className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Adding...' : 'Add'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

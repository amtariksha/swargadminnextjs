'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import { Globe, Edit, Upload } from 'lucide-react';

const IMAGE_BASE_URL = 'https://node.desicowmilk.com/public/uploads/images';

interface WebAppSetting {
    id: number;
    title: string;
    value: string;
    updated_at?: string;
}

export default function WebAppSettingsPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<WebAppSetting | null>(null);
    const [newValue, setNewValue] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: settings = [], isLoading } = useQuery({
        queryKey: ['webapp-settings'],
        queryFn: async () => {
            const response = await GET<WebAppSetting[]>('/get_web_app_settings');
            return response.data || [];
        },
    });

    const isImageField = (id: number) => id === 7 || id === 8; // Logo and Favicon

    const handleEdit = (item: WebAppSetting) => {
        setEditItem(item);
        setNewValue(item.value);
        setImageFile(null);
        setImagePreview(isImageField(item.id) ? `${IMAGE_BASE_URL}/${item.value}` : '');
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editItem) return;
        setIsSubmitting(true);
        try {
            let valueToUpdate = newValue;

            if (isImageField(editItem.id) && imageFile) {
                const uploadFormData = new FormData();
                uploadFormData.append('image', imageFile);
                const uploadRes = await POST<{ file: string }>('/upload_image_only', uploadFormData as unknown as Record<string, unknown>);
                valueToUpdate = (uploadRes as unknown as { file: string }).file;
            }

            await POST('/update_web_app_settings', {
                id: editItem.id,
                value: valueToUpdate,
            });

            setShowModal(false);
            setEditItem(null);
            queryClient.invalidateQueries({ queryKey: ['webapp-settings'] });
        } catch (error) {
            console.error('Update failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns: Column<WebAppSetting>[] = [
        {
            key: 'actions',
            header: 'Update',
            width: '80px',
            render: (item) => (
                <button onClick={() => handleEdit(item)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'title',
            header: 'Title',
            render: (item) => <span className="text-white font-medium">{item.title}</span>,
        },
        {
            key: 'value',
            header: 'Value',
            render: (item) => {
                if (isImageField(item.id)) {
                    return (
                        <img
                            src={`${IMAGE_BASE_URL}/${item.value}`}
                            alt={item.title}
                            className="h-10 w-auto object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }}
                        />
                    );
                }
                return <span className="text-slate-300 truncate max-w-xs block">{item.value}</span>;
            },
        },
        {
            key: 'updated_at',
            header: 'Updated',
            render: (item) => (
                <span className="text-slate-400 text-sm">
                    {item.updated_at ? new Date(item.updated_at).toLocaleString() : 'N/A'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Globe className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Web App Settings</h1>
                    <p className="text-slate-400">Configure web application appearance</p>
                </div>
            </div>

            <DataTable data={settings} columns={columns} loading={isLoading} searchPlaceholder="Search settings..." />

            {showModal && editItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Update {editItem.title}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Title</label>
                                <input type="text" value={editItem.title} disabled className="w-full px-4 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-500" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Value</label>
                                {isImageField(editItem.id) ? (
                                    <div>
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
                                            <img src={imagePreview} alt="Preview" className="mt-3 h-16 w-auto object-contain" />
                                        )}
                                    </div>
                                ) : (
                                    <textarea
                                        value={newValue}
                                        onChange={(e) => setNewValue(e.target.value)}
                                        rows={4}
                                        className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white resize-none"
                                    />
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
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

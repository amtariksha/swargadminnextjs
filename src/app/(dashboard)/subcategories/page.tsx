'use client';

import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { useSubcategories, useCategories, Subcategory } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus, Layers, Trash2, Edit, Image as ImageIcon, Upload, X } from 'lucide-react';
import { POST } from '@/lib/api';
import { IMAGE_BASE_URL } from '@/config/tenant';
import { toast } from 'sonner';

interface SubcatWithImage extends Subcategory {
    preferences?: number;
    image_id?: number | null;
    image?: string | null;
    cat_id?: number;
    cat_title?: string;
    updated_at?: string;
}

export default function SubcategoriesPage() {
    const { data: subcategories = [], isLoading, refetch } = useSubcategories();
    const { data: categories = [] } = useCategories();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<SubcatWithImage | null>(null);
    const [deleteItem, setDeleteItem] = useState<SubcatWithImage | null>(null);
    const [formData, setFormData] = useState({ title: '', cat_id: '', preferences: '0' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadImage, setUploadImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const openAdd = () => {
        setEditItem(null);
        setFormData({ title: '', cat_id: '', preferences: '0' });
        setUploadImage(null);
        setImagePreview(null);
        setIsModalOpen(true);
    };

    const openEdit = (item: SubcatWithImage) => {
        setEditItem(item);
        setFormData({
            title: item.title,
            cat_id: String(item.cat_id || item.category_id || ''),
            preferences: String(item.preferences ?? 0),
        });
        setUploadImage(null);
        setImagePreview(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditItem(null);
        setUploadImage(null);
        setImagePreview(null);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { toast.error('Image must be less than 2MB'); return; }
        setUploadImage(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title.trim() || !formData.cat_id) {
            toast.error('Title and Category are required');
            return;
        }
        setIsSubmitting(true);
        try {
            if (editItem) {
                await POST('/update_sub_cat', {
                    id: editItem.id,
                    title: formData.title.trim(),
                    cat_id: Number(formData.cat_id),
                    preferences: parseInt(formData.preferences) || 0,
                });
                if (uploadImage) {
                    const fd = new FormData();
                    fd.append('id', String(editItem.id));
                    fd.append('image_type', '1');
                    fd.append('image', uploadImage);
                    await POST('/sub_cat/upload_image', fd);
                }
                toast.success('Subcategory updated');
            } else {
                const res = await POST<{ response: number; message?: string; id?: number }>('/add_sub_cat', {
                    title: formData.title.trim(),
                    cat_id: Number(formData.cat_id),
                });
                const resData = res.data || res as unknown as { response: number; message?: string; id?: number };
                if (resData.response === 201) {
                    toast.error(resData.message || 'Already exists');
                    setIsSubmitting(false);
                    return;
                }
                if (uploadImage && resData.id) {
                    const fd = new FormData();
                    fd.append('id', String(resData.id));
                    fd.append('image_type', '1');
                    fd.append('image', uploadImage);
                    await POST('/sub_cat/upload_image', fd);
                }
                toast.success('Subcategory added');
            }
            closeModal();
            refetch();
        } catch { toast.error('Something went wrong'); }
        finally { setIsSubmitting(false); }
    };

    const handleDeleteImage = async () => {
        if (!editItem?.image_id) return;
        try {
            await POST('/cat/delete_image', { id: editItem.image_id });
            toast.success('Image deleted');
            setEditItem({ ...editItem, image: null, image_id: null });
            refetch();
        } catch { toast.error('Failed to delete image'); }
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        try {
            await POST('/delete_sub_cat', { id: deleteItem.id });
            toast.success('Subcategory deleted');
            setDeleteItem(null);
            refetch();
        } catch { toast.error('Failed to delete'); }
    };

    const columns: Column<SubcatWithImage>[] = [
        {
            key: 'edit', header: 'Edit', width: '70px',
            render: (item) => <button onClick={(e) => { e.stopPropagation(); openEdit(item); }} className="p-2 hover:bg-slate-800/50 rounded-lg"><Edit className="w-4 h-4 text-purple-400" /></button>,
        },
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'image', header: 'Image', width: '80px',
            render: (item) => item.image ? (
                <img src={`${IMAGE_BASE_URL}/${item.image}`} alt={item.title} className="w-11 h-11 rounded-lg object-cover" />
            ) : (
                <div className="w-11 h-11 bg-slate-800/50 rounded-lg flex items-center justify-center"><ImageIcon className="w-5 h-5 text-slate-600" /></div>
            ),
        },
        { key: 'title', header: 'Title', width: '200px' },
        { key: 'preferences', header: 'Preference', width: '100px' },
        {
            key: 'cat_title', header: 'Category', width: '180px',
            render: (item) => <span className="text-slate-400">{item.cat_title || item.category_title || '-'}</span>,
        },
        {
            key: 'updated_at', header: 'Last Update', width: '180px',
            render: (item) => {
                try { return <span className="text-sm text-slate-400">{format(new Date(item.updated_at!), 'dd-MM-yyyy HH:mm:ss')}</span>; }
                catch { return <span className="text-slate-600">-</span>; }
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Subcategories</h1>
                    <p className="text-slate-400">Manage product subcategories</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" /> Add Subcategory
                </button>
            </div>

            <DataTable data={subcategories as SubcatWithImage[]} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Search subcategories..." />

            {/* Add/Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={closeModal} title={editItem ? 'Update Subcategory' : 'Add New Subcategory'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Title *</label>
                        <input type="text" value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            required autoFocus
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Category *</label>
                        <select value={formData.cat_id}
                            onChange={(e) => setFormData({ ...formData, cat_id: e.target.value })}
                            required
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                            <option value="">Select category...</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                    </div>

                    {editItem && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">ID</label>
                                <input type="text" value={editItem.id} disabled
                                    className="w-full px-4 py-2.5 bg-slate-800/30 border border-slate-700/30 rounded-xl text-slate-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Preferences (display order)</label>
                                <input type="number" value={formData.preferences} min={0}
                                    onChange={(e) => setFormData({ ...formData, preferences: e.target.value.replace(/\D/g, '') })}
                                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                            </div>
                        </>
                    )}

                    {/* Image section */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Image</label>
                        {editItem?.image && !uploadImage ? (
                            <div className="relative inline-block">
                                <img src={`${IMAGE_BASE_URL}/${editItem.image}`} alt="Subcategory" className="w-24 h-24 rounded-xl object-cover" />
                                <button type="button" onClick={handleDeleteImage}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600">
                                    <X className="w-3 h-3 text-white" />
                                </button>
                            </div>
                        ) : imagePreview ? (
                            <div className="relative inline-block">
                                <img src={imagePreview} alt="Preview" className="w-24 h-24 rounded-xl object-cover" />
                                <button type="button" onClick={() => { setUploadImage(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center hover:bg-slate-600">
                                    <X className="w-3 h-3 text-white" />
                                </button>
                            </div>
                        ) : (
                            <div>
                                <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg" onChange={handleFileChange} className="hidden" />
                                <button type="button" onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border border-dashed border-slate-700/50 rounded-xl text-sm text-slate-400 hover:text-white hover:border-purple-500/50">
                                    <Upload className="w-4 h-4" /> Upload Image (max 2MB)
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4">
                        {editItem && (
                            <button type="button" onClick={() => { closeModal(); setDeleteItem(editItem); }}
                                className="px-4 py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm hover:bg-red-500/30">
                                Delete
                            </button>
                        )}
                        <div className="flex-1" />
                        <button type="button" onClick={closeModal}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                        <button type="submit" disabled={isSubmitting}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {isSubmitting ? 'Saving...' : editItem ? 'Update' : 'Add New Subcategory'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirm */}
            <ConfirmDialog isOpen={!!deleteItem} title="Delete Subcategory"
                message={`Do you want to delete "${deleteItem?.title}"?`}
                onConfirm={handleDelete} onCancel={() => setDeleteItem(null)} variant="danger" confirmText="Delete" />
        </div>
    );
}

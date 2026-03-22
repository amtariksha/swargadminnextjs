'use client';

import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { useCategories, Category } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus, FolderTree, Trash2, Edit, Image as ImageIcon, Upload, X } from 'lucide-react';
import { POST } from '@/lib/api';
import { IMAGE_BASE_URL } from '@/config/tenant';
import { toast } from 'sonner';

// Extended type with fields from backend formatCategoryData
interface CategoryWithImage extends Category {
    preferences?: number;
    image_id?: number | null;
    image?: string | null;
    updated_at?: string;
}

export default function CategoriesPage() {
    const { data: categories = [], isLoading, refetch } = useCategories();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<CategoryWithImage | null>(null);
    const [deleteItem, setDeleteItem] = useState<CategoryWithImage | null>(null);
    const [formData, setFormData] = useState({ title: '', preferences: '0' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadImage, setUploadImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const openAdd = () => {
        setEditItem(null);
        setFormData({ title: '', preferences: '0' });
        setUploadImage(null);
        setImagePreview(null);
        setIsModalOpen(true);
    };

    const openEdit = (item: CategoryWithImage) => {
        setEditItem(item);
        setFormData({ title: item.title, preferences: String(item.preferences ?? 0) });
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
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image must be less than 2MB');
            return;
        }
        setUploadImage(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title.trim()) return;
        setIsSubmitting(true);
        try {
            if (editItem) {
                // Update category
                const res = await POST<{ response: number; message?: string }>('/update_cat', {
                    id: editItem.id,
                    title: formData.title.trim(),
                    preferences: parseInt(formData.preferences) || 0,
                });
                const updateData = res.data || res as unknown as { response: number; message?: string };
                if (updateData.response === 201) {
                    toast.error(updateData.message || 'Title already exists');
                    setIsSubmitting(false);
                    return;
                }
                // Upload image if selected
                if (uploadImage) {
                    const fd = new FormData();
                    fd.append('id', String(editItem.id));
                    fd.append('image_type', '1');
                    fd.append('image', uploadImage);
                    await POST('/cat/upload_image', fd);
                }
                toast.success('Category updated');
            } else {
                // Add category
                const res = await POST<{ response: number; message?: string; id?: number }>('/add_cat', {
                    title: formData.title.trim(),
                });
                const resData = res.data || res as unknown as { response: number; message?: string; id?: number };
                if (resData.response === 201) {
                    toast.error(resData.message || 'Title already exists');
                    setIsSubmitting(false);
                    return;
                }
                // Upload image if selected
                if (uploadImage && resData.id) {
                    const fd = new FormData();
                    fd.append('id', String(resData.id));
                    fd.append('image_type', '1');
                    fd.append('image', uploadImage);
                    await POST('/cat/upload_image', fd);
                }
                toast.success('Category added');
            }
            closeModal();
            refetch();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteImage = async () => {
        if (!editItem?.image_id) return;
        try {
            await POST('/cat/delete_image', { image_id: editItem.image_id });
            toast.success('Image deleted');
            refetch();
            // Update editItem to reflect removed image
            setEditItem({ ...editItem, image: null, image_id: null });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete image');
        }
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        try {
            const res = await POST<{ response: number; message?: string }>('/delete_cat', { id: deleteItem.id });
            const delData = res.data || res as unknown as { response: number; message?: string };
            if (delData.response !== 200) {
                toast.error(delData.message || 'Cannot delete category');
            } else {
                toast.success('Category deleted');
            }
            setDeleteItem(null);
            refetch();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete');
        }
    };

    const columns: Column<CategoryWithImage>[] = [
        {
            key: 'edit', header: 'Edit', width: '70px',
            render: (item) => (
                <button onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                    className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'image', header: 'Image', width: '80px',
            render: (item) => item.image ? (
                <img src={`${IMAGE_BASE_URL}/${item.image}`} alt={item.title} className="w-11 h-11 rounded-lg object-cover" />
            ) : (
                <div className="w-11 h-11 bg-slate-800/50 rounded-lg flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-slate-600" />
                </div>
            ),
        },
        { key: 'title', header: 'Title', width: '200px' },
        { key: 'preferences', header: 'Preference', width: '100px' },
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
                    <h1 className="text-2xl font-bold text-white">Categories</h1>
                    <p className="text-slate-400">Manage product categories</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" /> Add Category
                </button>
            </div>

            <DataTable data={categories as CategoryWithImage[]} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Search categories..." />

            {/* Add/Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={closeModal} title={editItem ? 'Update Category' : 'Add New Category'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Title *</label>
                        <input type="text" value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            required autoFocus
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
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
                                <img src={`${IMAGE_BASE_URL}/${editItem.image}`} alt="Category" className="w-24 h-24 rounded-xl object-cover" />
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
                            {isSubmitting ? 'Saving...' : editItem ? 'Update' : 'Add New Category'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirm */}
            <ConfirmDialog
                isOpen={!!deleteItem}
                title="Delete Category"
                message={`Do you want to delete "${deleteItem?.title}"?`}
                onConfirm={handleDelete}
                onCancel={() => setDeleteItem(null)}
                variant="danger"
                confirmText="Delete"
            />
        </div>
    );
}

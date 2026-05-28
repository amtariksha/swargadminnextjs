'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTestimonials, useCreateTestimonial, useUpdateTestimonial, useDeleteTestimonial, Testimonial } from '@/hooks/useData';
import { POST } from '@/lib/api';
import { IMAGE_BASE_URL } from '@/config/tenant';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Star, Pencil, Trash2, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function TestimonialsPage() {
    const queryClient = useQueryClient();
    const { data: testimonials = [], isLoading } = useTestimonials();
    const createMutation = useCreateTestimonial();
    const updateMutation = useUpdateTestimonial();
    const deleteMutation = useDeleteTestimonial();

    const [modalOpen, setModalOpen] = useState(false);
    const [isAddMode, setIsAddMode] = useState(true);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    // Form state
    const [editId, setEditId] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [subTitle, setSubTitle] = useState('');
    const [rating, setRating] = useState<number>(5);
    const [description, setDescription] = useState('');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [existingImageId, setExistingImageId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingImage, setDeletingImage] = useState(false);

    const openAddModal = () => {
        setIsAddMode(true);
        setEditId(null);
        setTitle('');
        setSubTitle('');
        setRating(5);
        setDescription('');
        setImagePreview(null);
        setUploadFile(null);
        setExistingImageId(null);
        setModalOpen(true);
    };

    const openEditModal = (item: Testimonial) => {
        setIsAddMode(false);
        setEditId(item.id);
        setTitle(item.title || '');
        setSubTitle(item.sub_title || '');
        setRating(item.rating || 5);
        setDescription(item.description || '');
        setImagePreview(item.image ? `${IMAGE_BASE_URL}/${item.image}` : null);
        setUploadFile(null);
        setExistingImageId(item.image_id || null);
        setModalOpen(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size / 1024 >= 2048) {
            toast.error('File size must be less than 2MB');
            return;
        }
        setUploadFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const payload = { title, sub_title: subTitle, rating, description };

            if (isAddMode) {
                const result = await createMutation.mutateAsync(payload);
                const newId = (result as { id?: number }).id;
                if (uploadFile && newId) {
                    const formData = new FormData();
                    formData.append('image', uploadFile);
                    formData.append('image_type', '1');
                    formData.append('id', String(newId));
                    await POST('/testimonial/upload_image', formData);
                }
                toast.success('Testimonial added');
            } else {
                await updateMutation.mutateAsync({ id: editId, ...payload });
                if (uploadFile && editId) {
                    const formData = new FormData();
                    formData.append('image', uploadFile);
                    formData.append('image_type', '1');
                    formData.append('id', String(editId));
                    await POST('/testimonial/upload_image', formData);
                }
                toast.success('Testimonial updated');
            }
            setModalOpen(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editId) return;
        setSaving(true);
        try {
            await deleteMutation.mutateAsync({ id: editId });
            toast.success('Testimonial deleted');
            setDeleteDialogOpen(false);
            setModalOpen(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteImage = async () => {
        if (!existingImageId) return;
        setDeletingImage(true);
        try {
            await POST('/testimonial/delete_image', { image_id: existingImageId });
            setExistingImageId(null);
            setImagePreview(null);
            queryClient.invalidateQueries({ queryKey: ['testimonials'] });
            toast.success('Image deleted');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete image');
        } finally {
            setDeletingImage(false);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const columns: Column<Testimonial>[] = [
        {
            key: 'actions',
            header: 'Edit',
            width: '70px',
            sortable: false,
            render: (item) => (
                <button onClick={() => openEditModal(item)} className="p-1.5 hover:bg-purple-500/10 rounded-lg text-purple-400">
                    <Pencil className="w-4 h-4" />
                </button>
            ),
        },
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'image',
            header: 'Image',
            width: '70px',
            sortable: false,
            render: (item) => item.image ? (
                <img src={`${IMAGE_BASE_URL}/${item.image}`} alt="" className="w-10 h-10 object-cover rounded" />
            ) : (
                <div className="w-10 h-10 bg-slate-700 rounded flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-slate-500" />
                </div>
            ),
        },
        { key: 'title', header: 'Title' },
        { key: 'sub_title', header: 'Sub Title' },
        {
            key: 'rating',
            header: 'Rating',
            render: (item) => (
                <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < item.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`} />
                    ))}
                </div>
            ),
        },
        {
            key: 'description',
            header: 'Description',
            render: (item) => (
                <span className="text-slate-300 text-sm line-clamp-2 max-w-[250px]">{item.description}</span>
            ),
        },
        {
            key: 'updated_at',
            header: 'Last Update',
            width: '140px',
            render: (item) => <span className="text-slate-400 text-sm">{formatDate(item.updated_at)}</span>,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Testimonials</h1>
                    <p className="text-slate-400">Manage customer testimonials</p>
                </div>
                <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:opacity-90 transition-opacity">
                    <Plus className="w-5 h-5" />Add Testimonial
                </button>
            </div>

            <DataTable data={testimonials} columns={columns} loading={isLoading} searchPlaceholder="Search testimonials..." />

            {/* Add/Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <h2 className="text-lg font-semibold text-white">
                                {isAddMode ? 'Add New Testimonial' : 'Update Testimonial'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-slate-700 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
                                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Sub Title *</label>
                                <input type="text" required value={subTitle} onChange={(e) => setSubTitle(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Rating *</label>
                                <select value={rating} onChange={(e) => setRating(Number(e.target.value))}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                                    {[1, 2, 3, 4, 5].map(v => (
                                        <option key={v} value={v}>{'★'.repeat(v)}{'☆'.repeat(5 - v)}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Description *</label>
                                <textarea required rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none" />
                            </div>

                            {/* Image upload — hide file input if editing and image already exists */}
                            {!(existingImageId && !uploadFile) && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Image (max 2MB, .png/.jpg/.jpeg)</label>
                                    <input type="file" accept=".png,.jpg,.jpeg" onChange={handleFileChange}
                                        className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500/20 file:text-purple-400 hover:file:bg-purple-500/30" />
                                </div>
                            )}

                            {imagePreview && (
                                <div className="relative inline-block">
                                    <img src={imagePreview} alt="" className="w-24 h-auto rounded-lg border border-slate-600" />
                                    {existingImageId && (
                                        <button type="button" onClick={handleDeleteImage} disabled={deletingImage}
                                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700">
                                            {deletingImage ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <X className="w-3 h-3 text-white" />}
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="submit" disabled={saving}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {isAddMode ? 'Add Testimonial' : 'Update'}
                                </button>

                                {!isAddMode && (
                                    <button type="button" onClick={() => setDeleteDialogOpen(true)} disabled={saving}
                                        className="px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                                        <Trash2 className="w-4 h-4" /> Delete
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {deleteDialogOpen && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setDeleteDialogOpen(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-white mb-2">Delete Testimonial</h3>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete <span className="text-white font-medium">{title}</span>?
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteDialogOpen(false)} className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800">
                                Cancel
                            </button>
                            <button onClick={handleDelete} disabled={saving}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

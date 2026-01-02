'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCategories, Category } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { Plus, FolderTree, Trash2, Edit } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';

export default function CategoriesPage() {
    const router = useRouter();
    const { data: categories = [], isLoading, refetch } = useCategories();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Category | null>(null);
    const [formData, setFormData] = useState({ title: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (editItem) {
                await PUT(`/update_category/${editItem.id}`, formData);
            } else {
                await POST('/add_category', formData);
            }
            setIsModalOpen(false);
            setEditItem(null);
            setFormData({ title: '' });
            refetch();
        } catch (error) {
            console.error('Failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (item: Category) => {
        setEditItem(item);
        setFormData({ title: item.title });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this category?')) {
            await DELETE(`/delete_category/${id}`);
            refetch();
        }
    };

    const columns: Column<Category>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'title',
            header: 'Category',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                        <FolderTree className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="font-medium text-white">{item.title}</span>
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${item.status === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                    {item.status === 1 ? 'Active' : 'Inactive'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            sortable: false,
            render: (item) => (
                <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                        className="p-2 hover:bg-slate-800/50 rounded-lg">
                        <Edit className="w-4 h-4 text-slate-400" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-red-400">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Categories</h1>
                    <p className="text-slate-400">Manage product categories</p>
                </div>
                <button onClick={() => { setEditItem(null); setFormData({ title: '' }); setIsModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" />Add Category
                </button>
            </div>

            <DataTable data={categories} columns={columns} loading={isLoading} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editItem ? 'Edit Category' : 'Add Category'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Title</label>
                        <input type="text" value={formData.title} onChange={(e) => setFormData({ title: e.target.value })} required
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)}
                            className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">Cancel</button>
                        <button type="submit" disabled={isSubmitting}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                            {isSubmitting ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

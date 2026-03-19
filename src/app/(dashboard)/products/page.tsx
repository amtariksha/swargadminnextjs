'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useProducts, Product } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { inputClassName } from '@/components/FormField';
import { Plus, Package, Eye, Image as ImageIcon } from 'lucide-react';
import { POST } from '@/lib/api';
import { IMAGE_BASE_URL } from '@/config/tenant';
import { toast } from 'sonner';

export default function ProductsPage() {
    const router = useRouter();
    const { data: products = [], isLoading, refetch } = useProducts();
    const [quickEditModal, setQuickEditModal] = useState<{ product: Product; type: 'preferences' | 'stock_qty'; value: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleToggleActive = async (product: Product) => {
        try {
            await POST('/update_product', { id: product.id, is_active: product.is_active ? 0 : 1 });
            refetch();
        } catch { toast.error('Failed to update'); }
    };

    const handleQuickUpdate = async () => {
        if (!quickEditModal) return;
        setIsSubmitting(true);
        try {
            await POST('/update_product', {
                id: quickEditModal.product.id,
                [quickEditModal.type]: parseInt(quickEditModal.value) || 0,
            });
            toast.success('Updated');
            setQuickEditModal(null);
            refetch();
        } catch { toast.error('Failed to update'); }
        finally { setIsSubmitting(false); }
    };

    const columns: Column<Product>[] = [
        {
            key: 'view', header: 'View', width: '60px',
            render: (item) => (
                <button onClick={(e) => { e.stopPropagation(); router.push(`/products/${item.id}`); }}
                    className="p-1.5 hover:bg-slate-800/50 rounded-lg">
                    <Eye className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        {
            key: 'is_active', header: 'Active', width: '60px',
            render: (item) => (
                <button onClick={(e) => { e.stopPropagation(); handleToggleActive(item); }}
                    className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${item.is_active ? 'bg-green-600' : 'bg-slate-700'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
            ),
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
        { key: 'title', header: 'Title', width: '180px' },
        {
            key: 'preferences', header: 'Pref', width: '80px',
            render: (item) => (
                <button onClick={(e) => { e.stopPropagation(); setQuickEditModal({ product: item, type: 'preferences', value: String(item.preferences ?? 0) }); }}
                    className="flex items-center gap-1 hover:text-purple-400 text-slate-300">
                    <span>{item.preferences ?? 0}</span>
                    <span className="text-slate-600 text-xs">✎</span>
                </button>
            ),
        },
        { key: 'qty_text', header: 'Qty Text', width: '100px', render: (item) => <span className="text-sm">{item.qty_text || '-'}</span> },
        {
            key: 'subscription', header: 'Subs', width: '120px',
            render: (item) => (
                <span className={`text-xs ${item.subscription === 1 ? 'text-green-400' : item.subscription === 0 ? 'text-slate-500' : 'text-slate-600'}`}>
                    {item.subscription === 1 ? 'Subscription' : item.subscription === 0 ? 'Non Subs' : 'N/A'}
                </span>
            ),
        },
        {
            key: 'stock_qty', header: 'Stock', width: '80px',
            render: (item) => (
                <button onClick={(e) => { e.stopPropagation(); setQuickEditModal({ product: item, type: 'stock_qty', value: String(item.stock_qty ?? 0) }); }}
                    className="flex items-center gap-1 hover:text-purple-400 text-slate-300">
                    <span>{item.stock_qty ?? 0}</span>
                    <span className="text-slate-600 text-xs">✎</span>
                </button>
            ),
        },
        { key: 'price', header: 'Price', width: '80px', render: (item) => <span>₹{item.price}</span> },
        { key: 'mrp', header: 'MRP', width: '80px', render: (item) => <span className="text-slate-400">₹{item.mrp ?? '-'}</span> },
        { key: 'cat_title', header: 'Category', width: '130px', render: (item) => <span className="text-sm text-slate-400">{item.cat_title || '-'}</span> },
        { key: 'sub_cat_title', header: 'Subcategory', width: '130px', render: (item) => <span className="text-sm text-slate-400">{item.sub_cat_title || '-'}</span> },
        {
            key: 'updated_at', header: 'Last Update', width: '160px',
            render: (item) => {
                try { return <span className="text-sm text-slate-400">{format(new Date(item.updated_at!), 'dd-MM-yyyy HH:mm:ss')}</span>; }
                catch { return <span className="text-slate-600">-</span>; }
            },
        },
    ];

    const activeCount = products.filter(p => p.is_active).length;
    const inStock = products.filter(p => (p.stock_qty ?? 0) > 0).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Products</h1>
                    <p className="text-slate-400">Manage your product catalog</p>
                </div>
                <button onClick={() => router.push('/products/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" /> Add Product
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Products</p>
                    <p className="text-2xl font-bold text-white">{products.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Active</p>
                    <p className="text-2xl font-bold text-green-400">{activeCount}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">In Stock</p>
                    <p className="text-2xl font-bold text-blue-400">{inStock}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Out of Stock</p>
                    <p className="text-2xl font-bold text-red-400">{products.length - inStock}</p>
                </div>
            </div>

            <DataTable data={products} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Search products..."
                onRowClick={(item) => router.push(`/products/${item.id}`)} />

            {/* Quick Edit Modal (Preferences / Stock) */}
            {quickEditModal && (
                <Modal isOpen onClose={() => setQuickEditModal(null)}
                    title={`Update ${quickEditModal.type === 'preferences' ? 'Preferences' : 'Stock Quantity'}`}>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-400">{quickEditModal.product.title}</p>
                        <input type="number" value={quickEditModal.value} min={0}
                            onChange={(e) => setQuickEditModal({ ...quickEditModal, value: e.target.value })}
                            autoFocus className={inputClassName} />
                        <div className="flex gap-3">
                            <button onClick={() => setQuickEditModal(null)}
                                className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                            <button onClick={handleQuickUpdate} disabled={isSubmitting}
                                className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 rounded-xl disabled:opacity-50">
                                {isSubmitting ? 'Updating...' : 'Update'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

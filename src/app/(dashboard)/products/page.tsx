'use client';

import { useRouter } from 'next/navigation';
import { useProducts, Product } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Package, Edit, Trash2 } from 'lucide-react';
import { DELETE } from '@/lib/api';

export default function ProductsPage() {
    const router = useRouter();
    const { data: products = [], isLoading, refetch } = useProducts();

    const columns: Column<Product>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'title',
            header: 'Product',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-800 rounded-lg overflow-hidden">
                        {item.photo ? (
                            <img src={item.photo} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-6 h-6 text-slate-500" />
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="text-xs text-slate-400">{item.unit}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'price',
            header: 'Price',
            render: (item) => (
                <div>
                    {item.discount_price && item.discount_price < item.price ? (
                        <>
                            <span className="font-semibold text-green-400">₹{item.discount_price}</span>
                            <span className="ml-2 text-sm text-slate-500 line-through">₹{item.price}</span>
                        </>
                    ) : (
                        <span className="font-semibold text-white">₹{item.price}</span>
                    )}
                </div>
            ),
        },
        {
            key: 'stock',
            header: 'Stock',
            render: (item) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${item.stock > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                    {item.stock > 0 ? item.stock : 'Out of stock'}
                </span>
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
                    <button onClick={(e) => { e.stopPropagation(); router.push(`/products/${item.id}`); }}
                        className="p-2 hover:bg-slate-800/50 rounded-lg">
                        <Edit className="w-4 h-4 text-slate-400" />
                    </button>
                    <button onClick={async (e) => { e.stopPropagation(); if (confirm('Delete?')) { await DELETE(`/delete_product/${item.id}`); refetch(); } }}
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
                    <h1 className="text-2xl font-bold text-white">Products</h1>
                    <p className="text-slate-400">Manage your product catalog</p>
                </div>
                <button onClick={() => router.push('/products/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" />Add Product
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Products</p>
                    <p className="text-2xl font-bold text-white">{products.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">In Stock</p>
                    <p className="text-2xl font-bold text-green-400">{products.filter(p => p.stock > 0).length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Out of Stock</p>
                    <p className="text-2xl font-bold text-red-400">{products.filter(p => p.stock === 0).length}</p>
                </div>
            </div>

            <DataTable
                data={products}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search products..."
                onRowClick={(item) => router.push(`/products/${item.id}`)}
            />
        </div>
    );
}

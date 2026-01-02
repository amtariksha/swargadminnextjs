'use client';

import { useTestimonials, Testimonial } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, MessageSquare, Star, Trash2 } from 'lucide-react';
import { DELETE } from '@/lib/api';

export default function TestimonialsPage() {
    const { data: testimonials = [], isLoading, refetch } = useTestimonials();

    const columns: Column<Testimonial>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'name',
            header: 'Customer',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {item.name?.charAt(0).toUpperCase() || 'C'}
                    </div>
                    <div>
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.designation || 'Customer'}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'message',
            header: 'Message',
            render: (item) => (
                <div className="flex items-start gap-2 max-w-xs">
                    <MessageSquare className="w-4 h-4 text-purple-400 mt-1 flex-shrink-0" />
                    <span className="text-slate-300 text-sm line-clamp-2">{item.message}</span>
                </div>
            ),
        },
        {
            key: 'rating',
            header: 'Rating',
            render: (item) => (
                <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < item.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`} />
                    ))}
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
                <button onClick={async (e) => { e.stopPropagation(); if (confirm('Delete?')) { await DELETE(`/delete_testimonial/${item.id}`); refetch(); } }}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-red-400">
                    <Trash2 className="w-4 h-4" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Testimonials</h1>
                    <p className="text-slate-400">Customer reviews and feedback</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" />Add Testimonial
                </button>
            </div>

            <DataTable data={testimonials} columns={columns} loading={isLoading} searchPlaceholder="Search testimonials..." />
        </div>
    );
}

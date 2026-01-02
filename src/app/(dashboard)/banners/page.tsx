'use client';

import { useState } from 'react';
import { useBanners, Banner } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { Plus, Image as ImageIcon, Trash2, Edit, Eye } from 'lucide-react';
import { DELETE } from '@/lib/api';

export default function BannersPage() {
    const { data: banners = [], isLoading, refetch } = useBanners();

    const columns: Column<Banner>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'photo',
            header: 'Banner',
            render: (item) => (
                <div className="w-24 h-14 bg-slate-800 rounded-lg overflow-hidden">
                    {item.photo ? (
                        <img src={item.photo} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-slate-500" />
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'title',
            header: 'Title',
            render: (item) => <span className="font-medium text-white">{item.title}</span>,
        },
        {
            key: 'link',
            header: 'Link',
            render: (item) => item.link ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-1">
                    <Eye className="w-3 h-3" /> View
                </a>
            ) : '-',
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
                <button onClick={async (e) => { e.stopPropagation(); if (confirm('Delete?')) { await DELETE(`/delete_banner/${item.id}`); refetch(); } }}
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
                    <h1 className="text-2xl font-bold text-white">Banners</h1>
                    <p className="text-slate-400">Manage promotional banners</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" />Add Banner
                </button>
            </div>

            <DataTable data={banners} columns={columns} loading={isLoading} />
        </div>
    );
}

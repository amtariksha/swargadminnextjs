'use client';

import { useState } from 'react';
import { useDropPoints, DropPoint } from '@/hooks/useData';
import { useWarehouses } from '@/hooks/useCurrencyWarehouse';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, X, MapPin, Trash2 } from 'lucide-react';
import { POST } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IMAGE_BASE_URL } from '@/config/tenant';

const MAX_PHOTOS = 5;

export default function DropPointsPage() {
    const queryClient = useQueryClient();
    const { data: dropPoints = [], isLoading } = useDropPoints();
    const { data: warehouses = [] } = useWarehouses();

    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [title, setTitle] = useState('');
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [routeOrder, setRouteOrder] = useState('');
    const [notes, setNotes] = useState('');
    const [warehouseId, setWarehouseId] = useState('');

    const current = editId != null ? dropPoints.find((d) => d.id === editId) : null;
    const photos = current?.photos || [];

    const openAdd = () => {
        setEditId(null);
        setTitle('');
        setLat('');
        setLng('');
        setRouteOrder('');
        setNotes('');
        setWarehouseId('');
        setShowModal(true);
    };

    const openEdit = (dp: DropPoint) => {
        setEditId(dp.id);
        setTitle(dp.title || '');
        setLat(dp.lat != null ? String(dp.lat) : '');
        setLng(dp.lng != null ? String(dp.lng) : '');
        setRouteOrder(String(dp.route_order ?? ''));
        setNotes(dp.notes || '');
        setWarehouseId(dp.warehouse_id != null ? String(dp.warehouse_id) : '');
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                title,
                lat: lat.trim() === '' ? null : lat.trim(),
                lng: lng.trim() === '' ? null : lng.trim(),
                route_order: routeOrder.trim() === '' ? null : routeOrder.trim(),
                notes,
                warehouse_id: warehouseId === '' ? null : Number(warehouseId),
            };
            if (editId != null) {
                await POST('/update_drop_point', { id: editId, ...payload });
                toast.success('Drop point updated');
            } else {
                const result = await POST<unknown>('/add_drop_point', payload);
                const newId = (result as { id?: number }).id;
                toast.success('Drop point created');
                // Keep the modal open in edit mode so photos can be added.
                if (newId) setEditId(newId);
            }
            queryClient.invalidateQueries({ queryKey: ['drop-points'] });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (dp: DropPoint) => {
        if (!window.confirm(`Delete drop point "${dp.title}"?`)) return;
        try {
            await POST('/delete_drop_point', { id: dp.id });
            toast.success('Drop point deleted');
            queryClient.invalidateQueries({ queryKey: ['drop-points'] });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not delete drop point');
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || editId == null) return;
        if (photos.length >= MAX_PHOTOS) {
            toast.error(`A drop point can have at most ${MAX_PHOTOS} photos`);
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            fd.append('drop_point_id', String(editId));
            await POST('/drop_point/upload_photo', fd);
            toast.success('Photo uploaded');
            queryClient.invalidateQueries({ queryKey: ['drop-points'] });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Photo upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handlePhotoDelete = async (photoId: number) => {
        try {
            await POST('/drop_point/delete_photo', { id: photoId });
            queryClient.invalidateQueries({ queryKey: ['drop-points'] });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not delete photo');
        }
    };

    const columns: Column<DropPoint>[] = [
        {
            key: 'edit',
            header: 'Edit',
            width: '70px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                    className="px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 text-xs font-medium"
                >
                    Edit
                </button>
            ),
        },
        { key: 'id', header: 'ID', width: '60px' },
        { key: 'title', header: 'Title', width: '220px' },
        { key: 'route_order', header: 'Route Order', width: '110px' },
        {
            key: 'driver_count',
            header: 'Drivers',
            width: '90px',
            render: (item) => <span className="text-slate-300">{item.driver_count}</span>,
        },
        {
            key: 'photos',
            header: 'Photos',
            width: '90px',
            render: (item) => <span className="text-slate-300">{item.photos.length}</span>,
        },
        {
            key: 'delete',
            header: '',
            width: '60px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                    className="p-2 hover:bg-red-500/20 rounded-lg"
                >
                    <Trash2 className="w-4 h-4 text-red-400" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <MapPin className="w-7 h-7 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Drop Points</h1>
                        <p className="text-slate-400">Truck-route drop points and photos</p>
                    </div>
                </div>
                <button
                    onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                >
                    <Plus className="w-5 h-5" />
                    Add New
                </button>
            </div>

            <DataTable
                data={dropPoints}
                columns={columns}
                loading={isLoading}
                pageSize={50}
                searchPlaceholder="Search drop points"
                emptyMessage="No drop points yet"
            />

            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white">
                                {editId != null ? 'Edit Drop Point' : 'Add Drop Point'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Latitude</label>
                                    <input
                                        type="text"
                                        value={lat}
                                        onChange={(e) => setLat(e.target.value)}
                                        placeholder="12.9716"
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Longitude</label>
                                    <input
                                        type="text"
                                        value={lng}
                                        onChange={(e) => setLng(e.target.value)}
                                        placeholder="77.5946"
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Route Order</label>
                                <input
                                    type="number"
                                    value={routeOrder}
                                    onChange={(e) => setRouteOrder(e.target.value)}
                                    placeholder="Auto"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Warehouse (supply)</label>
                                <select
                                    value={warehouseId}
                                    onChange={(e) => setWarehouseId(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                                >
                                    <option value="">— unassigned —</option>
                                    {warehouses.map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {w.name} ({w.supply_mode === 'factory_pickup' ? 'Dairy pickup' : `Truck${w.truck_driver_name ? ` · ${w.truck_driver_name}` : ''}`})
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-500 mt-1">
                                    Decides how this stop is stocked — truck driver drop vs pickup from the factory.
                                    Configure warehouses under Settings → Warehouses.
                                </p>
                            </div>
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : editId != null ? 'Update' : 'Create'}
                            </button>
                        </form>

                        {/* Photos — only after the drop point exists */}
                        {editId != null && (
                            <div className="mt-5 pt-5 border-t border-slate-700">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold text-white">
                                        Photos ({photos.length}/{MAX_PHOTOS})
                                    </h3>
                                    {photos.length < MAX_PHOTOS && (
                                        <label className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 cursor-pointer hover:bg-slate-700">
                                            {uploading ? 'Uploading…' : 'Add Photo'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handlePhotoUpload}
                                                disabled={uploading}
                                                className="hidden"
                                            />
                                        </label>
                                    )}
                                </div>
                                {photos.length === 0 ? (
                                    <p className="text-slate-500 text-sm">No photos yet.</p>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2">
                                        {photos.map((p) => (
                                            <div key={p.id} className="relative group">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={`${IMAGE_BASE_URL}/${p.image_path}`}
                                                    alt="Drop point"
                                                    className="w-full h-24 object-cover rounded-lg"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handlePhotoDelete(p.id)}
                                                    className="absolute top-1 right-1 p-1 bg-black/70 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

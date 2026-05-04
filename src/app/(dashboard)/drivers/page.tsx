'use client';

import { useState } from 'react';
import { useDrivers, Driver } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, X } from 'lucide-react';
import { POST } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseApiDate } from '@/lib/dateUtils';
export default function DriversPage() {
    const queryClient = useQueryClient();
    const { data: drivers = [], isLoading } = useDrivers();
    const [showModal, setShowModal] = useState(false);
    const [isAddMode, setIsAddMode] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formIsLocation, setFormIsLocation] = useState(0);
    const [editUserId, setEditUserId] = useState<number | null>(null);

    const openAddModal = () => {
        setIsAddMode(true);
        setFormName('');
        setFormEmail('');
        setFormPhone('');
        setFormIsLocation(0);
        setEditUserId(null);
        setShowModal(true);
    };

    const openEditModal = (driver: Driver) => {
        setIsAddMode(false);
        setFormName(driver.name || '');
        setFormEmail(driver.email || '');
        setFormPhone(driver.phone || '');
        setFormIsLocation(driver.is_location || 0);
        setEditUserId(driver.user_id || driver.id);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isAddMode) {
                await POST('/add_user', { name: formName, email: formEmail, phone: formPhone, role: 4 });
                toast.success('New Driver Added successfully');
            } else {
                await POST('/update_user', { id: editUserId, name: formName, email: formEmail, phone: formPhone, is_location: formIsLocation });
                toast.success('User Details Updated successfully');
            }
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            setShowModal(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const columns: Column<Driver>[] = [
        {
            key: 'update',
            header: 'Update',
            width: '80px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                    className="px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 text-xs font-medium"
                >
                    Edit
                </button>
            ),
        },
        {
            key: 'id',
            header: 'ID',
            width: '60px',
        },
        {
            key: 'image',
            header: 'Image',
            width: '80px',
            render: (item) => (
                item.image ? (
                    <img src={item.image} alt={item.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                        {item.name?.charAt(0).toUpperCase() || 'D'}
                    </div>
                )
            ),
        },
        {
            key: 'name',
            header: 'Name',
            width: '180px',
        },
        {
            key: 'email',
            header: 'Email',
            width: '250px',
            render: (item) => (
                <span className="text-slate-300">{item.email || '-'}</span>
            ),
        },
        {
            key: 'phone',
            header: 'Phone',
            width: '150px',
            render: (item) => (
                <span className="text-slate-300">{item.phone || '-'}</span>
            ),
        },
        {
            key: 'updated_at',
            header: 'Last Update',
            width: '200px',
            render: (item) => {
                const d = parseApiDate(item.updated_at);
                if (!d) return <span className="text-slate-500">-</span>;
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                const ss = String(d.getSeconds()).padStart(2, '0');
                return <span className="text-slate-400 text-sm">{`${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`}</span>;
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Drivers</h1>
                    <p className="text-slate-400">Manage Drivers</p>
                </div>
                <button
                    onClick={openAddModal}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                >
                    <Plus className="w-5 h-5" />
                    Add New
                </button>
            </div>

            <DataTable
                data={drivers}
                columns={columns}
                loading={isLoading}
                pageSize={50}
                searchPlaceholder="Search"
                emptyMessage="No drivers found"
            />

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white">
                                {isAddMode ? 'Add New Driver' : 'Update Driver Details'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Email {formPhone ? '' : '*'}
                                </label>
                                <input
                                    type="email"
                                    value={formEmail}
                                    onChange={(e) => setFormEmail(e.target.value)}
                                    required={!formPhone}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Number {formEmail ? '' : '*'}
                                </label>
                                <input
                                    type="tel"
                                    value={formPhone}
                                    onChange={(e) => setFormPhone(e.target.value)}
                                    required={!formEmail}
                                    maxLength={12}
                                    pattern="[0-9]*"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>
                            {!isAddMode && (
                                <div className="flex items-center gap-3">
                                    <label className="text-sm font-medium text-slate-300">Driver Location</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-slate-400">Off</span>
                                        <button
                                            type="button"
                                            onClick={() => setFormIsLocation(formIsLocation === 1 ? 0 : 1)}
                                            className={`relative w-10 h-5 rounded-full transition-colors ${formIsLocation === 1 ? 'bg-green-600' : 'bg-slate-600'}`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${formIsLocation === 1 ? 'translate-x-5' : ''}`} />
                                        </button>
                                        <span className="text-sm text-slate-400">On</span>
                                    </div>
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : isAddMode ? 'Add New Driver' : 'Update'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

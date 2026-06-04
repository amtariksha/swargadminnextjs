'use client';

import { useState } from 'react';
import { useDrivers, useDropPoints, Driver, DRIVER_ROLES } from '@/hooks/useData';
import { DELIVERY_PERMISSIONS } from '@/lib/deliveryPermissions';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, X, Check } from 'lucide-react';
import { POST } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseApiDate } from '@/lib/dateUtils';
export default function DriversPage() {
    const queryClient = useQueryClient();
    // Wave-4 #7 — /drivers is the page the admin uses to manage
    // active/inactive, so it MUST see inactive rows. Every other consumer
    // (dropdowns, payroll, assignment filters) calls useDrivers() with no
    // arg → backend filters to active only.
    const { data: drivers = [], isLoading } = useDrivers({ includeInactive: true });
    const { data: dropPoints = [] } = useDropPoints();
    const [showModal, setShowModal] = useState(false);
    const [isAddMode, setIsAddMode] = useState(true);
    const [saving, setSaving] = useState(false);
    const [togglingId, setTogglingId] = useState<number | null>(null);

    const toggleActive = async (driver: Driver) => {
        const currentlyActive = (driver.is_active ?? 1) === 1;
        const next = currentlyActive ? 0 : 1;
        const verb = currentlyActive ? 'Deactivate' : 'Reactivate';
        if (!window.confirm(`${verb} driver "${driver.name}"?`)) return;
        setTogglingId(driver.user_id);
        try {
            await POST('/update_user', { id: driver.user_id, is_active: next });
            await queryClient.invalidateQueries({ queryKey: ['drivers'] });
            toast.success(`Driver ${currentlyActive ? 'deactivated' : 'reactivated'}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update driver');
        } finally {
            setTogglingId(null);
        }
    };

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formIsLocation, setFormIsLocation] = useState(0);
    const [formDropPointId, setFormDropPointId] = useState('');
    const [formRole, setFormRole] = useState(4);
    const [editUserId, setEditUserId] = useState<number | null>(null);
    // Per-user delivery-app capability override (added on top of the role's caps).
    const [formDeliveryCaps, setFormDeliveryCaps] = useState<string[]>([]);

    const toggleDeliveryCap = (key: string) => {
        setFormDeliveryCaps((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
        );
    };

    const openAddModal = () => {
        setIsAddMode(true);
        setFormName('');
        setFormEmail('');
        setFormPhone('');
        setFormIsLocation(0);
        setFormDropPointId('');
        setFormRole(4);
        setEditUserId(null);
        setFormDeliveryCaps([]);
        setShowModal(true);
    };

    const openEditModal = (driver: Driver) => {
        setIsAddMode(false);
        setFormName(driver.name || '');
        setFormEmail(driver.email || '');
        setFormPhone(driver.phone || '');
        setFormIsLocation(driver.is_location || 0);
        setFormDropPointId(driver.drop_point_id != null ? String(driver.drop_point_id) : '');
        setFormRole(driver.role_id || 4);
        setEditUserId(driver.user_id || driver.id);
        setFormDeliveryCaps(driver.delivery_permissions || []);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isAddMode) {
                await POST('/add_user', { name: formName, email: formEmail, phone: formPhone, role: formRole });
                toast.success('New Driver Added successfully');
            } else {
                await POST('/update_user', {
                    id: editUserId,
                    name: formName,
                    email: formEmail,
                    phone: formPhone,
                    is_location: formIsLocation,
                    // drop_point_id only applies to last-mile (role 4) drivers.
                    ...(formRole === 4
                        ? { drop_point_id: formDropPointId === '' ? null : Number(formDropPointId) }
                        : {}),
                    // Extra delivery-app access on top of the driver's role.
                    delivery_permissions: formDeliveryCaps,
                });
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
            key: 'role_label',
            header: 'Type',
            width: '110px',
            render: (item) => (
                <span className="px-2 py-0.5 rounded-lg bg-slate-700/50 text-slate-300 text-xs font-medium">
                    {item.role_label || '-'}
                </span>
            ),
        },
        {
            // Wave-4 #7 — Active toggle. Inactive drivers stay listed here
            // (so the admin can re-activate them) but disappear from every
            // other surface that consumes useDrivers().
            key: 'is_active',
            header: 'Active',
            width: '120px',
            render: (item) => {
                const active = (item.is_active ?? 1) === 1;
                const busy = togglingId === item.user_id;
                return (
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleActive(item); }}
                        disabled={busy}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50 ${active
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            }`}
                        title={active ? 'Deactivate driver — hides from dropdowns/payroll/assignments' : 'Reactivate driver'}
                    >
                        {active ? 'Active' : 'Inactive'}
                    </button>
                );
            },
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
                            {isAddMode && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Driver Type *</label>
                                    <select
                                        value={formRole}
                                        onChange={(e) => setFormRole(Number(e.target.value))}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    >
                                        {DRIVER_ROLES.map((r) => (
                                            <option key={r.id} value={r.id}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {!isAddMode && formRole === 4 && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Drop Point</label>
                                    <select
                                        value={formDropPointId}
                                        onChange={(e) => setFormDropPointId(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    >
                                        <option value="">— Not assigned —</option>
                                        {dropPoints.map((dp) => (
                                            <option key={dp.id} value={dp.id}>{dp.title}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
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
                            {!isAddMode && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Delivery App Capabilities</label>
                                    <p className="text-xs text-slate-500 mb-2">
                                        Extra delivery-app access for this driver, added on top of their role
                                        (e.g. give a last-mile driver Collection Pickup without changing their route).
                                        The driver must log out and back in to pick up changes.
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {DELIVERY_PERMISSIONS.map((perm) => (
                                            <button
                                                key={perm.key}
                                                type="button"
                                                onClick={() => toggleDeliveryCap(perm.key)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${formDeliveryCaps.includes(perm.key)
                                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                                    : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:border-slate-600'}`}
                                            >
                                                <span className="text-base">{perm.icon}</span>
                                                <span className="truncate">{perm.label}</span>
                                                {formDeliveryCaps.includes(perm.key) && (
                                                    <Check className="w-4 h-4 ml-auto text-emerald-400 flex-shrink-0" />
                                                )}
                                            </button>
                                        ))}
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

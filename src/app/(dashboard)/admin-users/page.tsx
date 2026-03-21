'use client';

import { useState } from 'react';
import { useAdminUsers, useRoles, useCreateAdminUser, useUpdateAdminUser, useDeleteAdminUser, AdminUser } from '@/hooks/useAdminUsers';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, UserCog, Shield, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminUsersPage() {
    const { data: adminUsers = [], isLoading } = useAdminUsers();
    const { data: roles = [] } = useRoles();
    const createMutation = useCreateAdminUser();
    const updateMutation = useUpdateAdminUser();
    const deleteMutation = useDeleteAdminUser();

    const [showModal, setShowModal] = useState(false);
    const [isAddMode, setIsAddMode] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    // Form state
    const [editId, setEditId] = useState<number | null>(null);
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formRoleId, setFormRoleId] = useState(2);

    const openAddModal = () => {
        setIsAddMode(true);
        setEditId(null);
        setFormName('');
        setFormEmail('');
        setFormPhone('');
        setFormPassword('');
        setFormRoleId(2);
        setShowModal(true);
    };

    const openEditModal = (user: AdminUser) => {
        setIsAddMode(false);
        setEditId(user.user_id || user.id);
        setFormName(user.name || '');
        setFormEmail(user.email || '');
        setFormPhone(user.phone || '');
        setFormPassword('');
        setFormRoleId(user.role?.[0]?.role_id || 2);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isAddMode) {
                const result = await createMutation.mutateAsync({
                    name: formName,
                    email: formEmail,
                    phone: formPhone,
                    password: formPassword,
                    role_id: formRoleId,
                });
                if (result.response === 201 || result.response === 400) {
                    toast.error((result as { message?: string }).message || 'Failed to create user');
                    return;
                }
                toast.success('Admin user created');
            } else {
                const result = await updateMutation.mutateAsync({
                    id: editId!,
                    name: formName,
                    email: formEmail,
                    phone: formPhone,
                });
                if (result.response === 201 || result.response === 400) {
                    toast.error((result as { message?: string }).message || 'Failed to update user');
                    return;
                }
                toast.success('Admin user updated');
            }
            setShowModal(false);
        } catch {
            toast.error('Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editId) return;
        setSaving(true);
        try {
            await deleteMutation.mutateAsync(editId);
            toast.success('Admin user deleted');
            setDeleteDialogOpen(false);
            setShowModal(false);
        } catch {
            toast.error('Failed to delete');
        } finally {
            setSaving(false);
        }
    };

    const getRoleColor = (roleTitle: string) => {
        switch (roleTitle?.toUpperCase()) {
            case 'SUPER ADMIN':
                return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
            case 'ADMIN':
                return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
            case 'SUB ADMIN':
                return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
            default:
                return 'bg-slate-500/20 text-slate-400 border border-slate-500/30';
        }
    };

    const columns: Column<AdminUser>[] = [
        {
            key: 'actions',
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
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'name',
            header: 'User',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {item.name?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div>
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.email}</p>
                    </div>
                </div>
            ),
        },
        { key: 'phone', header: 'Phone' },
        {
            key: 'role',
            header: 'Role',
            render: (item) => {
                const role = item.role?.[0];
                return (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRoleColor(role?.role_title || '')}`}>
                        <Shield className="w-3 h-3 inline mr-1" />
                        {role?.role_title || 'No Role'}
                    </span>
                );
            },
        },
        {
            key: 'updated_at',
            header: 'Last Update',
            width: '160px',
            render: (item) => {
                const dateStr = item.updated_at || item.created_at;
                if (!dateStr) return <span className="text-slate-500">-</span>;
                const d = new Date(dateStr);
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                return <span className="text-slate-400 text-sm">{`${dd}-${mm}-${yyyy} ${hh}:${min}`}</span>;
            },
        },
    ];

    // Stats
    const stats = {
        total: adminUsers.length,
        superAdmins: adminUsers.filter(u => u.role?.[0]?.role_id === 1).length,
        admins: adminUsers.filter(u => u.role?.[0]?.role_id === 2).length,
        subAdmins: adminUsers.filter(u => u.role?.[0]?.role_id === 3).length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Admin Users</h1>
                    <p className="text-slate-400">Manage administrator access</p>
                </div>
                <button
                    onClick={openAddModal}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                >
                    <Plus className="w-5 h-5" />
                    Add Admin
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <UserCog className="w-8 h-8 text-purple-400" />
                        <div>
                            <p className="text-sm text-slate-400">Total</p>
                            <p className="text-2xl font-bold text-white">{stats.total}</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Super Admins</p>
                    <p className="text-2xl font-bold text-purple-400">{stats.superAdmins}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Admins</p>
                    <p className="text-2xl font-bold text-blue-400">{stats.admins}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Sub-Admins</p>
                    <p className="text-2xl font-bold text-cyan-400">{stats.subAdmins}</p>
                </div>
            </div>

            {/* Data Table */}
            <DataTable
                data={adminUsers}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search admins..."
            />

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white">
                                {isAddMode ? 'Add Admin User' : 'Update Admin User'}
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
                                <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                                <input
                                    type="email"
                                    value={formEmail}
                                    onChange={(e) => setFormEmail(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Phone *</label>
                                <input
                                    type="tel"
                                    value={formPhone}
                                    onChange={(e) => setFormPhone(e.target.value)}
                                    required
                                    maxLength={12}
                                    pattern="[0-9]*"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>
                            {isAddMode && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Password *</label>
                                        <input
                                            type="password"
                                            value={formPassword}
                                            onChange={(e) => setFormPassword(e.target.value)}
                                            required
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Role *</label>
                                        <select
                                            value={formRoleId}
                                            onChange={(e) => setFormRoleId(Number(e.target.value))}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        >
                                            {roles.length > 0 ? (
                                                roles.map((role) => (
                                                    <option key={role.id} value={role.id}>{role.title}</option>
                                                ))
                                            ) : (
                                                <>
                                                    <option value={1}>Super Admin</option>
                                                    <option value={2}>Admin</option>
                                                    <option value={3}>Sub Admin</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </>
                            )}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {isAddMode ? 'Create Admin' : 'Update'}
                                </button>
                                {!isAddMode && (
                                    <button
                                        type="button"
                                        onClick={() => setDeleteDialogOpen(true)}
                                        disabled={saving}
                                        className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                                    >
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
                        <h3 className="text-lg font-semibold text-white mb-2">Delete Admin User</h3>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete <span className="text-white font-medium">{formName}</span>?
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

'use client';

import { useState } from 'react';
import { useAdminUsers, useRoles, useCreateAdminUser, useDeleteAdminUser, AdminUser } from '@/hooks/useAdminUsers';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, UserCog, Shield, Trash2, Edit, X } from 'lucide-react';

export default function AdminUsersPage() {
    const { data: adminUsers = [], isLoading } = useAdminUsers();
    const { data: roles = [] } = useRoles();
    const createMutation = useCreateAdminUser();
    const deleteMutation = useDeleteAdminUser();

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        role_id: 2, // Default to Admin
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createMutation.mutateAsync(formData);
            setShowModal(false);
            setFormData({ name: '', email: '', phone: '', password: '', role_id: 2 });
        } catch (error) {
            console.error('Failed to create admin user:', error);
        }
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this admin user?')) {
            try {
                await deleteMutation.mutateAsync(id);
            } catch (error) {
                console.error('Failed to delete admin user:', error);
            }
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
            width: '100px',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
                        <Edit className="w-4 h-4 text-slate-400" />
                    </button>
                    <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                </div>
            ),
        },
    ];

    // Stats
    const stats = {
        total: adminUsers.length,
        active: adminUsers.filter(u => u.status === 1).length,
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
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                >
                    <Plus className="w-5 h-5" />
                    Add Admin
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                    <p className="text-sm text-slate-400">Active</p>
                    <p className="text-2xl font-bold text-green-400">{stats.active}</p>
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

            {/* Create Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">Add Admin User</h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-700/50 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Phone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Password</label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Role</label>
                                <select
                                    value={formData.role_id}
                                    onChange={(e) => setFormData({ ...formData, role_id: Number(e.target.value) })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                >
                                    <option value={2}>Admin</option>
                                    <option value={3}>Sub Admin</option>
                                    {roles.map((role) => (
                                        <option key={role.id} value={role.id}>
                                            {role.title}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="submit"
                                disabled={createMutation.isPending}
                                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50"
                            >
                                {createMutation.isPending ? 'Creating...' : 'Create Admin'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

'use client';

import { useState } from 'react';
import { useRoles, useCreateRole, useUpdateRole, Role } from '@/hooks/useAdminUsers';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Shield, Edit, X, Check, Lock } from 'lucide-react';

// Available pages/permissions
const AVAILABLE_PERMISSIONS = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'drivers', label: 'Drivers', icon: '🚚' },
    { key: 'orders', label: 'Orders', icon: '📦' },
    { key: 'products', label: 'Products', icon: '🛒' },
    { key: 'categories', label: 'Categories', icon: '📁' },
    { key: 'subcategories', label: 'Subcategories', icon: '📂' },
    { key: 'delivery-list', label: 'Delivery List', icon: '📋' },
    { key: 'delivery-report', label: 'Delivery Report', icon: '📈' },
    { key: 'transactions', label: 'Transactions', icon: '💰' },
    { key: 'banners', label: 'Banners', icon: '🖼️' },
    { key: 'testimonials', label: 'Testimonials', icon: '⭐' },
    { key: 'pincodes', label: 'Pincodes', icon: '📍' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'admin-users', label: 'Admin Users', icon: '👤' },
    { key: 'roles', label: 'Roles', icon: '🔐' },
];

export default function RolesPage() {
    const { data: roles = [], isLoading } = useRoles();
    const createMutation = useCreateRole();
    const updateMutation = useUpdateRole();

    const [showModal, setShowModal] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        permissions: [] as string[],
    });

    const handleOpenCreate = () => {
        setEditingRole(null);
        setFormData({ title: '', permissions: [] });
        setShowModal(true);
    };

    const handleOpenEdit = (role: Role) => {
        setEditingRole(role);
        setFormData({
            title: role.title,
            permissions: role.permissions || [],
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingRole) {
                await updateMutation.mutateAsync({
                    id: editingRole.id,
                    ...formData,
                });
            } else {
                await createMutation.mutateAsync(formData);
            }
            setShowModal(false);
            setFormData({ title: '', permissions: [] });
            setEditingRole(null);
        } catch (error) {
            console.error('Failed to save role:', error);
        }
    };

    const togglePermission = (permission: string) => {
        setFormData(prev => ({
            ...prev,
            permissions: prev.permissions.includes(permission)
                ? prev.permissions.filter(p => p !== permission)
                : [...prev.permissions, permission],
        }));
    };

    const columns: Column<Role>[] = [
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'title',
            header: 'Role',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-medium text-white">{item.title}</span>
                </div>
            ),
        },
        {
            key: 'permissions',
            header: 'Permissions',
            render: (item) => (
                <div className="flex flex-wrap gap-1">
                    {item.permissions && item.permissions.length > 0 ? (
                        <>
                            {item.permissions.slice(0, 3).map((p) => (
                                <span key={p} className="px-2 py-0.5 bg-slate-700/50 text-slate-300 rounded text-xs">
                                    {p}
                                </span>
                            ))}
                            {item.permissions.length > 3 && (
                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                                    +{item.permissions.length - 3} more
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="text-slate-500 text-sm">Full Access</span>
                    )}
                </div>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            width: '80px',
            render: (item) => (
                <button
                    onClick={() => handleOpenEdit(item)}
                    className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                    <Edit className="w-4 h-4 text-slate-400" />
                </button>
            ),
        },
    ];

    // Default system roles
    const systemRoles: Role[] = [
        { id: 1, title: 'Super Admin', permissions: [] },
        { id: 2, title: 'Admin', permissions: [] },
        { id: 3, title: 'Sub Admin', permissions: ['dashboard', 'orders', 'delivery-list'] },
        { id: 4, title: 'Delivery Partner', permissions: [] },
    ];

    const allRoles = [...systemRoles, ...roles];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Roles & Permissions</h1>
                    <p className="text-slate-400">Manage user role access levels</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg shadow-indigo-500/25"
                >
                    <Plus className="w-5 h-5" />
                    Add Role
                </button>
            </div>

            {/* Info Card */}
            <div className="glass rounded-2xl p-6">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Lock className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white mb-1">Role-Based Access Control</h3>
                        <p className="text-sm text-slate-400">
                            Create custom roles with specific page permissions. Users assigned to a role will only see
                            the pages they have access to. Super Admin and Admin roles have full access by default.
                        </p>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <DataTable
                data={allRoles}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search roles..."
            />

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {editingRole ? 'Edit Role' : 'Create Role'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-700/50 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Role Name</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="e.g., Marketing Manager"
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-3">Page Permissions</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {AVAILABLE_PERMISSIONS.map((perm) => (
                                        <button
                                            key={perm.key}
                                            type="button"
                                            onClick={() => togglePermission(perm.key)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${formData.permissions.includes(perm.key)
                                                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                                                    : 'bg-slate-800/30 border-slate-700/50 text-slate-400 hover:border-slate-600'
                                                }`}
                                        >
                                            <span className="text-base">{perm.icon}</span>
                                            <span className="text-sm">{perm.label}</span>
                                            {formData.permissions.includes(perm.key) && (
                                                <Check className="w-4 h-4 ml-auto text-purple-400" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Leave empty for full access. Selected: {formData.permissions.length} pages
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={createMutation.isPending || updateMutation.isPending}
                                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50"
                            >
                                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingRole ? 'Update Role' : 'Create Role'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

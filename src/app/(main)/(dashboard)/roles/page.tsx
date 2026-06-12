'use client';

import { useState } from 'react';
import { useRoles, useCreateRole, useUpdateRole, Role } from '@/hooks/useAdminUsers';
import { DELIVERY_PERMISSIONS } from '@/lib/deliveryPermissions';
import { isDeliveryOnlyRole } from '@/lib/roles';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Shield, Edit, X, Check, Lock } from 'lucide-react';
import { toast } from 'sonner';

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
    // Refunds — gates the Refunds Report screen + the refund-reason settings
    // editor. The refund popup itself stays under the `transactions` key.
    { key: 'refunds', label: 'Refunds', icon: '💸' },
    // Payroll — driver salary master + monthly payslip generation.
    { key: 'payroll', label: 'Payroll', icon: '🧾' },
    // Returnable Packaging (Feature 07) — packaging-type CRUD + the
    // Returns & Refunds approval surface.
    { key: 'packaging', label: 'Returnable Packaging', icon: '📦' },
    { key: 'banners', label: 'Banners', icon: '🖼️' },
    { key: 'testimonials', label: 'Testimonials', icon: '⭐' },
    { key: 'pincodes', label: 'Pincodes', icon: '📍' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'admin-users', label: 'Admin Users', icon: '👤' },
    { key: 'roles', label: 'Roles', icon: '🔐' },
    // CMS — Payload admin mounted at /admin. Gates the Topbar
    // Operations↔CMS toggle AND the Sidebar "CMS" entry.
    { key: 'cms', label: 'CMS', icon: '🌐' },
    // WhatsApp CRM — merged-in WACRM section under /whatsapp/**.
    // Granting this exposes the WhatsApp section in the Sidebar (Inbox,
    // Contacts, Broadcast, Templates, Payments, Ad Campaigns, Analytics,
    // Settings). Full-access roles (empty permissions array) automatically
    // see this entry too. Default: ON for super-admin, OFF for other roles.
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    // CRM — customer feedback log, call worklist, and guided call scripts
    // under /crm/**. Granting this exposes the CRM section in the Sidebar
    // and the Feedback tab on the customer-detail page.
    { key: 'crm', label: 'CRM', icon: '📞' },
    // LMS — Lead Management & Marketing System under /lms/**. Phase 1
    // foundation: consent ledger, tags + segments, RFM, leads (5 sources),
    // welcome + replenishment journeys, referrals, Inner Circle, Agent
    // Force integration. Requirements doc:
    // /home/pradeep/Downloads/swarg-requirements.md.
    { key: 'lms', label: 'LMS', icon: '✨' },
    // Driver-facing page: granting only this permission lets the user
    // log in and reach `/production-delivery` (Routewise / Packing /
    // Dairy Pickup tabs) — and nothing else.
    { key: 'production-delivery', label: 'Production Delivery', icon: '🚛' },
    // Payload CMS admin gate — required to log into /admin (the embedded
    // Payload UI for new.swargfood.com). Verified by the JWT auth strategy
    // in src/payload/strategies/jwtAuth.ts.
    { key: 'payload_admin', label: 'Payload CMS Admin', icon: '🛠️' },
    // Inventory (Feature 11) — vendors, raw materials, purchases, ledger.
    { key: 'inventory', label: 'Inventory', icon: '🏬' },
    // Production (Feature 16) — intermediates, recipes, production records.
    { key: 'production', label: 'Production', icon: '🏭' },
    // Accounting (AI-Accountant) — GST invoicing, customer ledgers, HSN/rate
    // mapping, Tally sync, bank reconciliation, B2C consolidation, payment
    // reminders. Granting this exposes the Accounting section in the Sidebar.
    { key: 'accounting', label: 'Accounting', icon: '🧮' },
    // App Updates (Feature 02) — version + force-update management for the
    // customer and delivery apps.
    { key: 'app-updates', label: 'App Updates', icon: '📱' },
    // Drop Points (Feature 03) — truck-route drop-point management + driver
    // assignment.
    { key: 'drop-points', label: 'Drop Points', icon: '📍' },
    // Broadcast (Feature 09) — the admin broadcast composer. The notification
    // image library stays under the existing `notifications` key.
    { key: 'broadcast', label: 'Broadcast Notifications', icon: '📢' },
    // Day Orders (Feature 10) — day-time ordering panel, payment links, and
    // sales reporting / incentive. Granting this exposes the Day Orders
    // entry in the Sidebar (sales executives are admin-panel users).
    { key: 'day-orders', label: 'Day Orders', icon: '☀️' },
];

// Delivery-app capabilities (DELIVERY_PERMISSIONS, imported at top) are a
// SEPARATE permission set from the admin page permissions above — stored in
// role.delivery_permissions, independent of role.permissions, so granting one
// never shrinks a role's admin-panel access.

export default function RolesPage() {
    const { data: roles = [], isLoading } = useRoles();
    const createMutation = useCreateRole();
    const updateMutation = useUpdateRole();

    const [showModal, setShowModal] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        permissions: [] as string[],
        delivery_permissions: [] as string[],
    });

    const handleOpenCreate = () => {
        setEditingRole(null);
        setFormData({ title: '', permissions: [], delivery_permissions: [] });
        setShowModal(true);
    };

    const handleOpenEdit = (role: Role) => {
        setEditingRole(role);
        setFormData({
            title: role.title,
            permissions: role.permissions || [],
            delivery_permissions: role.delivery_permissions || [],
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
            setFormData({ title: '', permissions: [], delivery_permissions: [] });
            setEditingRole(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save role');
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

    const toggleDeliveryPermission = (permission: string) => {
        setFormData(prev => ({
            ...prev,
            delivery_permissions: prev.delivery_permissions.includes(permission)
                ? prev.delivery_permissions.filter(p => p !== permission)
                : [...prev.delivery_permissions, permission],
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

    // Use DB roles directly — no hardcoded duplicates
    const allRoles = roles;

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

                            {isDeliveryOnlyRole({ role_id: editingRole?.id, role_title: formData.title }) ? (
                                <div className="px-4 py-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                                    <p className="text-sm text-slate-300">Driver roles access the delivery app only.</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Admin-panel page permissions don&apos;t apply — manage app capabilities
                                        below, or per-driver on the <span className="text-slate-300">/drivers</span> page.
                                    </p>
                                </div>
                            ) : (
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
                            )}

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Delivery App Permissions</label>
                                <p className="text-xs text-slate-500 mb-3">
                                    Separate from the admin pages above — these gate what a user sees in the
                                    Flutter delivery app. They never affect admin-panel access.
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {DELIVERY_PERMISSIONS.map((perm) => (
                                        <button
                                            key={perm.key}
                                            type="button"
                                            onClick={() => toggleDeliveryPermission(perm.key)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${formData.delivery_permissions.includes(perm.key)
                                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                                    : 'bg-slate-800/30 border-slate-700/50 text-slate-400 hover:border-slate-600'
                                                }`}
                                        >
                                            <span className="text-base">{perm.icon}</span>
                                            <span className="text-sm">{perm.label}</span>
                                            {formData.delivery_permissions.includes(perm.key) && (
                                                <Check className="w-4 h-4 ml-auto text-emerald-400" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Selected: {formData.delivery_permissions.length} delivery pages
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

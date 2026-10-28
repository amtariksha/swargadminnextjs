'use client';

import { useState } from 'react';
import { useRoles, useCreateRole, useUpdateRole, Role } from '@/hooks/useAdminUsers';
import { DELIVERY_PERMISSIONS } from '@/lib/deliveryPermissions';
import { isDeliveryOnlyRole } from '@/lib/roles';
import {
    PULSE_SECTION_LABELS,
    PULSE_SECTION_PERMISSIONS,
    type PulseSection,
} from '@/lib/pulsePermissions';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Shield, Edit, X, Check, Lock } from 'lucide-react';
import { toast } from 'sonner';

// Available pages/permissions. Every sidebar page has a key here, and the keys
// must match KNOWN_PERMISSION_KEYS in components/Sidebar.tsx (a key the
// Sidebar doesn't know leaves its page visible to every role). `group` mirrors
// the sidebar sections so the checkbox grid reads like the menu.
//
// Broad parent keys ('accounting', 'business-pulse', 'delivery-list',
// 'inventory', 'production-delivery') still grant every page under them, so
// existing roles keep what they had. The narrower keys next to them grant one
// page each, for roles that should see that page alone.
interface PagePermission {
    key: string;
    label: string;
    icon: string;
    group: string;
}

const PULSE_SECTION_ORDER: PulseSection[] = [
    'revenue', 'shopOutstanding', 'subscriptions', 'wastage', 'drivers', 'vendorVariance',
];

const AVAILABLE_PERMISSIONS: PagePermission[] = [
    // ── Reports ──
    { key: 'dashboard', label: 'Dashboard', icon: '📊', group: 'Reports' },
    // Business Pulse (Phase 5) — CEO metrics dashboard at /business-pulse
    // (revenue, subscriptions, wastage, drivers, vendor pricing). The parent
    // key shows every section; the 'pulse-*' keys show one section each.
    { key: 'business-pulse', label: 'Business Pulse (all sections)', icon: '📈', group: 'Reports' },
    ...PULSE_SECTION_ORDER.map((section) => ({
        key: PULSE_SECTION_PERMISSIONS[section],
        label: PULSE_SECTION_LABELS[section],
        icon: '📈',
        group: 'Reports',
    })),
    { key: 'performance-report', label: 'Performance Report', icon: '📈', group: 'Reports' },
    { key: 'delivery-report', label: 'Delivery Report', icon: '📈', group: 'Reports' },
    { key: 'recovery', label: 'Recovery Report', icon: '💹', group: 'Reports' },
    // Refunds — gates the Refunds Report screen + the refund-reason settings
    // editor. The refund popup itself stays under the `transactions` key.
    { key: 'refunds', label: 'Refunds', icon: '💸', group: 'Reports' },
    // Payroll — driver salary master + monthly payslip generation.
    { key: 'payroll', label: 'Payroll', icon: '🧾', group: 'Reports' },

    // ── Deliveries ──
    { key: 'delivery-list', label: 'Delivery List (+ Shop Deliveries)', icon: '📋', group: 'Deliveries' },
    { key: 'delivery-shops', label: 'Shop Deliveries only', icon: '🏪', group: 'Deliveries' },
    // Driver-facing page: granting only this permission lets the user
    // log in and reach `/production-delivery` (Routewise / Packing /
    // Dairy Pickup tabs) — and nothing else.
    { key: 'production-delivery', label: 'Production Delivery', icon: '🚛', group: 'Deliveries' },

    // ── People ──
    { key: 'users', label: 'Customers', icon: '👥', group: 'People' },
    { key: 'accounting-customers', label: 'B2B / B2C', icon: '🏪', group: 'People' },
    { key: 'drivers', label: 'Drivers', icon: '🚚', group: 'People' },
    { key: 'admin-users', label: 'Admin Users', icon: '👤', group: 'People' },
    { key: 'roles', label: 'Roles', icon: '🔐', group: 'People' },

    // ── Products ──
    { key: 'products', label: 'Products', icon: '🛒', group: 'Products' },
    { key: 'categories', label: 'Categories', icon: '📁', group: 'Products' },
    { key: 'subcategories', label: 'Subcategories', icon: '📂', group: 'Products' },
    // Variations attribute library (/attributes). Was already a sidebar key
    // but missing here, so restricted roles could never be given it.
    { key: 'attributes', label: 'Attributes', icon: '🏷️', group: 'Products' },
    { key: 'reviews', label: 'Product Reviews', icon: '⭐', group: 'Products' },

    // ── Orders ──
    { key: 'orders', label: 'Orders', icon: '📦', group: 'Orders' },
    // Day Orders (Feature 10) — day-time ordering panel, payment links, and
    // sales reporting / incentive. Granting this exposes the Day Orders
    // entry in the Sidebar (sales executives are admin-panel users).
    { key: 'day-orders', label: 'Day Orders', icon: '☀️', group: 'Orders' },
    // Stall POS. 'pos' is the till itself — it TAKES MONEY, so a market-stall
    // operator needs only this. 'pos-queue' is the counter board without the
    // money, for staff who make the food but do not handle cash. 'stalls' is
    // menu and price management, which neither should have.
    { key: 'pos', label: 'Stall Till (takes money)', icon: '🧾', group: 'Orders' },
    { key: 'pos-queue', label: 'Stall Counter (no money)', icon: '🔔', group: 'Orders' },
    { key: 'stalls', label: 'Stalls & Menus', icon: '🏪', group: 'Orders' },
    { key: 'transactions', label: 'Transactions', icon: '💰', group: 'Orders' },
    // Returnable Packaging (Feature 07) — packaging-type CRUD + the
    // Returns & Refunds approval surface.
    { key: 'packaging', label: 'Returnable Packaging', icon: '📦', group: 'Orders' },

    // ── Messaging ──
    // Broadcast (Feature 09) — the admin broadcast composer. The notification
    // image library stays under the existing `notifications` key.
    { key: 'broadcast', label: 'Broadcast Notifications', icon: '📢', group: 'Messaging' },
    { key: 'notifications', label: 'Notification Images, Logs & Low Wallet', icon: '🔔', group: 'Messaging' },
    // WhatsApp CRM — merged-in WACRM section under /whatsapp/**.
    // Granting this exposes the WhatsApp section in the Sidebar (Inbox,
    // Contacts, Broadcast, Templates, Payments, Ad Campaigns, Analytics,
    // Settings). Full-access roles (empty permissions array) automatically
    // see this entry too. Default: ON for super-admin, OFF for other roles.
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬', group: 'Messaging' },
    // Desk — ticket workspace under /desk/**. 'desk' is the agent right;
    // 'desk-manager' adds dashboard, morning review, settings and category editing.
    { key: 'desk', label: 'Desk (tickets)', icon: '🎫', group: 'Messaging' },
    { key: 'desk-manager', label: 'Desk manager (dashboard, review, settings)', icon: '📋', group: 'Messaging' },
    // CRM — customer feedback log, call worklist, and guided call scripts
    // under /crm/**. Granting this exposes the CRM section in the Sidebar
    // and the Feedback tab on the customer-detail page.
    { key: 'crm', label: 'CRM', icon: '📞', group: 'Messaging' },
    // LMS — Lead Management & Marketing System under /lms/**. Phase 1
    // foundation: consent ledger, tags + segments, RFM, leads (5 sources),
    // welcome + replenishment journeys, referrals, Inner Circle, Agent
    // Force integration. Requirements doc:
    // /home/pradeep/Downloads/swarg-requirements.md.
    { key: 'lms', label: 'LMS', icon: '✨', group: 'Messaging' },

    // ── Accounting ──
    // Accounting (AI-Accountant) — GST invoicing, customer ledgers, HSN/rate
    // mapping, Tally sync, bank reconciliation, B2C consolidation, payment
    // reminders. The parent key grants every accounting page (and B2B / B2C);
    // the keys below grant one page each.
    { key: 'accounting', label: 'Accounting (all pages)', icon: '🧮', group: 'Accounting' },
    { key: 'accounting-overview', label: 'Accounting Overview', icon: '⚙️', group: 'Accounting' },
    { key: 'accounting-accounts', label: 'Chart of Accounts', icon: '📒', group: 'Accounting' },
    { key: 'accounting-vouchers', label: 'Vouchers', icon: '📄', group: 'Accounting' },
    { key: 'accounting-invoices', label: 'Invoices', icon: '📄', group: 'Accounting' },
    { key: 'accounting-shops-billing', label: 'Shops Billing', icon: '🏪', group: 'Accounting' },
    { key: 'accounting-purchases', label: 'Purchases / Bills', icon: '🧾', group: 'Accounting' },
    { key: 'accounting-reimbursements', label: 'Reimbursements', icon: '💵', group: 'Accounting' },
    { key: 'accounting-hsn', label: 'HSN & Rates', icon: '🏷️', group: 'Accounting' },
    { key: 'accounting-b2c-consolidation', label: 'B2C Consolidation', icon: '📅', group: 'Accounting' },
    { key: 'accounting-trial-balance', label: 'Trial Balance', icon: '📊', group: 'Accounting' },
    { key: 'accounting-balance-sheet', label: 'Balance Sheet', icon: '📊', group: 'Accounting' },
    { key: 'accounting-pnl', label: 'Profit & Loss', icon: '📈', group: 'Accounting' },
    { key: 'accounting-day-book', label: 'Day Book', icon: '📅', group: 'Accounting' },
    { key: 'accounting-sales-register', label: 'Sales Register', icon: '🧾', group: 'Accounting' },
    { key: 'accounting-gst-returns', label: 'GST Returns', icon: '🧾', group: 'Accounting' },
    { key: 'accounting-stock', label: 'Stock & Valuation', icon: '📦', group: 'Accounting' },
    { key: 'accounting-ledgers', label: 'Ledgers', icon: '📒', group: 'Accounting' },
    { key: 'accounting-statements', label: 'Statements', icon: '📒', group: 'Accounting' },
    { key: 'accounting-tally', label: 'Tally Settings', icon: '🔗', group: 'Accounting' },
    { key: 'accounting-reconcile', label: 'Tally Reconcile', icon: '🔁', group: 'Accounting' },
    { key: 'accounting-opening-balances', label: 'Opening Balances', icon: '📒', group: 'Accounting' },
    { key: 'accounting-bank-recon', label: 'Bank Reconciliation', icon: '🏦', group: 'Accounting' },
    { key: 'accounting-reminders', label: 'Payment Reminders', icon: '⏰', group: 'Accounting' },

    // ── Inventory & Production ──
    // Inventory (Feature 11) — vendors, raw materials, purchases, ledger.
    { key: 'inventory', label: 'Inventory (all pages)', icon: '🏬', group: 'Inventory & Production' },
    { key: 'inventory-dairy-records', label: 'Dairy Records only', icon: '🥛', group: 'Inventory & Production' },
    // Production (Feature 16) — intermediates, recipes, production records.
    { key: 'production', label: 'Production', icon: '🏭', group: 'Inventory & Production' },

    // ── Settings ──
    { key: 'settings', label: 'Settings', icon: '⚙️', group: 'Settings' },
    { key: 'banners', label: 'Banners', icon: '🖼️', group: 'Settings' },
    { key: 'testimonials', label: 'Testimonials', icon: '⭐', group: 'Settings' },
    { key: 'pages', label: 'Pages', icon: '📄', group: 'Settings' },
    // App Updates (Feature 02) — version + force-update management for the
    // customer and delivery apps.
    { key: 'app-updates', label: 'App Updates', icon: '📱', group: 'Settings' },
    { key: 'delivery-locations', label: 'Delivery Locations', icon: '🧭', group: 'Settings' },
    // Drop Points (Feature 03) — truck-route drop-point management + driver
    // assignment.
    { key: 'drop-points', label: 'Drop Points', icon: '📍', group: 'Settings' },
    { key: 'pincodes', label: 'Pincodes', icon: '📍', group: 'Settings' },
    // CMS — Payload admin mounted at /admin. Gates the Topbar
    // Operations↔CMS toggle AND the Sidebar "CMS" entry.
    { key: 'cms', label: 'CMS', icon: '🌐', group: 'Settings' },
    // Payload CMS admin gate — required to log into /admin (the embedded
    // Payload UI for new.swargfood.com). Verified by the JWT auth strategy
    // in src/payload/strategies/jwtAuth.ts.
    { key: 'payload_admin', label: 'Payload CMS Admin', icon: '🛠️', group: 'Settings' },

    // ── Archive ──
    { key: 'upcoming-orders', label: 'Upcoming Orders', icon: '🛒', group: 'Archive' },
    { key: 'upcoming-subs-orders', label: 'Upcoming Subs', icon: '📅', group: 'Archive' },
    { key: 'pre-packing-list', label: 'Pre-Packing List', icon: '📦', group: 'Archive' },
    { key: 'holidays', label: 'User Holidays', icon: '🏖️', group: 'Archive' },
    { key: 'calendar', label: 'Calendar', icon: '📆', group: 'Archive' },
];

/** AVAILABLE_PERMISSIONS split by group, in first-seen order. */
const PERMISSION_GROUPS: { group: string; perms: PagePermission[] }[] = AVAILABLE_PERMISSIONS.reduce(
    (groups, perm) => {
        const existing = groups.find((g) => g.group === perm.group);
        return existing
            ? groups.map((g) => (g === existing ? { ...g, perms: [...g.perms, perm] } : g))
            : [...groups, { group: perm.group, perms: [perm] }];
    },
    [] as { group: string; perms: PagePermission[] }[],
);

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
                    <div className="glass rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
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
                                <div className="space-y-4">
                                    {PERMISSION_GROUPS.map(({ group, perms }) => (
                                        <div key={group}>
                                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">{group}</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {perms.map((perm) => (
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
                                                        <span className="text-sm text-left">{perm.label}</span>
                                                        {formData.permissions.includes(perm.key) && (
                                                            <Check className="w-4 h-4 ml-auto text-purple-400" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {formData.permissions.length === 0 ? (
                                    /* "Leave empty for full access" is easy to read as
                                       "leave empty for no access", and the mistake is
                                       silent: computePermissions() in lib/auth.tsx grants
                                       hasFullAccess to any role with an empty array. A role
                                       meant for a market-stall casual would hand them
                                       accounting, WhatsApp and the role editor itself. */
                                    <p className="text-xs text-amber-300 mt-2 flex items-start gap-1.5">
                                        <span aria-hidden="true">&#9888;</span>
                                        <span>
                                            <strong>Nothing selected means FULL ACCESS</strong> to every
                                            page, not none. Tick the pages this role should reach.
                                        </span>
                                    </p>
                                ) : (
                                    <p className="text-xs text-slate-500 mt-2">
                                        Selected: {formData.permissions.length} pages
                                    </p>
                                )}
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

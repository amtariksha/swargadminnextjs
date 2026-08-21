'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo, useRef } from 'react';
import { BRANDING } from '@/config/tenant';
import { useAuth } from '@/lib/auth';
import { useFeatureFlag } from '@/hooks/useData';
import {
    Activity,
    LayoutDashboard,
    CalendarDays,
    Users,
    Truck,
    FolderTree,
    Layers,
    Package,
    ShoppingCart,
    Calendar,
    CreditCard,
    Image,
    FileText,
    MapPin,
    MessageSquare,
    Settings,
    Bell,
    Wallet,
    Globe,
    Receipt,
    Navigation,
    Banknote,
    Share2,
    ChevronDown,
    ChevronRight,
    X,
    ClipboardList,
    BarChart3,
    TrendingUp,
    MessageCircle,
    Inbox,
    Megaphone,
    Target,
    Phone,
    Warehouse,
    Boxes,
    BookText,
    Factory,
    Trash2,
    RotateCcw,
    Smartphone,
    PackageCheck,
    Sun,
    Clock,
    Sparkles,
    UserPlus,
    Tags,
    Workflow,
    ShieldCheck,
    Calculator,
    IndianRupee,
    Search,
    Store,
} from 'lucide-react';

interface NavItem {
    name: string;
    href?: string;
    icon: React.ReactNode;
    children?: NavItem[];
    /** Override the permission key derived from `href`. Use when the URL
     *  segment doesn't match the AVAILABLE_PERMISSIONS key — e.g. the CMS
     *  entry below points at `/admin` (Payload's mount) but is gated by
     *  the explicit `cms` permission. */
    permissionKey?: string;
    /** Open in a new tab (plain <a target="_blank">). Used by CMS — Payload
     *  is a separate app shell; navigating in-tab would drop the operator
     *  out of the admin panel. */
    external?: boolean;
}

/**
 * The whole nav is grouped into sections (2026-07 menu reorg): Reports /
 * Deliveries / People / Products / Orders / Notifications / WhatsApp / CRM /
 * LMS / Accounting / Settings / Archive. Groups are pure CONTAINERS — no
 * permissionKey needed on a parent (filterNav keeps a group iff ≥1 child
 * survives the role filter); gating happens per-leaf.
 */
const navItems: NavItem[] = [
    {
        name: 'Reports',
        icon: <BarChart3 className="w-5 h-5" />,
        children: [
            { name: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
            // Business Pulse (Phase 5) — CEO metrics over the v_pulse_* views.
            // Gated by the 'business-pulse' permission (grant to the CEO role only).
            { name: 'Business Pulse', href: '/business-pulse', icon: <Activity className="w-4 h-4" /> },
            { name: 'Performance Report', href: '/performance-report', icon: <TrendingUp className="w-4 h-4" /> },
            { name: 'Delivery Report', href: '/delivery-report', icon: <BarChart3 className="w-4 h-4" /> },
            { name: 'Recovery Report', href: '/recovery', icon: <IndianRupee className="w-4 h-4" /> },
            { name: 'Refunds Report', href: '/refunds', icon: <RotateCcw className="w-4 h-4" />, permissionKey: 'refunds' },
            { name: 'Payroll Reports', href: '/payroll', icon: <Banknote className="w-4 h-4" />, permissionKey: 'payroll' },
        ],
    },
    {
        name: 'Deliveries',
        icon: <Truck className="w-5 h-5" />,
        children: [
            { name: 'Delivery List', href: '/delivery-list', icon: <ClipboardList className="w-4 h-4" /> },
        ],
    },
    {
        name: 'People',
        icon: <Users className="w-5 h-5" />,
        children: [
            // Customers = the /users page. App vs Day-order customers is the
            // on-page filter dropdown (classified via has_app/day_orders).
            { name: 'Customers', href: '/users', icon: <Users className="w-4 h-4" /> },
            { name: 'Drivers', href: '/drivers', icon: <Truck className="w-4 h-4" /> },
            { name: 'Admin Users', href: '/admin-users', icon: <UserPlus className="w-4 h-4" /> },
            { name: 'Roles & Permissions', href: '/roles', icon: <ShieldCheck className="w-4 h-4" /> },
        ],
    },
    {
        name: 'Products',
        icon: <Package className="w-5 h-5" />,
        children: [
            { name: 'Categories', href: '/categories', icon: <FolderTree className="w-4 h-4" /> },
            { name: 'Sub Categories', href: '/subcategories', icon: <Layers className="w-4 h-4" /> },
            { name: 'Products', href: '/products', icon: <Package className="w-4 h-4" /> },
            // Product variations attribute library (migration 030 / D-7).
            // Stripped RECURSIVELY when enable_variations is off — see stripByHref.
            { name: 'Attributes', href: '/attributes', icon: <Tags className="w-4 h-4" /> },
            // Customer reviews moderation (migration 033 / Phase H).
            { name: 'Product Reviews', href: '/reviews', icon: <MessageSquare className="w-4 h-4" /> },
        ],
    },
    {
        name: 'Orders',
        icon: <ShoppingCart className="w-5 h-5" />,
        children: [
            { name: 'Orders', href: '/orders', icon: <ShoppingCart className="w-4 h-4" /> },
            { name: 'Day Orders', href: '/day-orders', icon: <Sun className="w-4 h-4" />, permissionKey: 'day-orders' },
            // Stall POS (migration 113). Two entries, two permissions:
            // /stalls is the office-side menu and price management, while /pos
            // is the till itself. The till is normally reached by scanning the
            // stall's QR and unlocked with the shared passcode — but an admin
            // raising a bill from the office has no QR to scan, and without a
            // link here the page is unreachable from the panel. It opens
            // chrome-less (its own route group), same as Production Delivery.
            { name: 'Stalls & Menus', href: '/stalls', icon: <Store className="w-4 h-4" />, permissionKey: 'stalls' },
            { name: 'Stall Till', href: '/pos', icon: <Calculator className="w-4 h-4" />, permissionKey: 'pos' },
            { name: 'Transactions', href: '/transactions', icon: <CreditCard className="w-4 h-4" /> },
            // Feature 07 — returnable packaging returns/refunds desk.
            { name: 'Refunds & Returns', href: '/returns-refunds', icon: <RotateCcw className="w-4 h-4" />, permissionKey: 'packaging' },
        ],
    },
    // The consolidated /notifications composer absorbed the standalone
    // /broadcast page (that route redirects here) — gated by the existing
    // `broadcast` permission so no RBAC migration. Deliberately TOP-LEVEL,
    // not inside WhatsApp: since the channel slider it broadcasts on BOTH
    // channels (in-app push via FCM and WhatsApp templates via msg91).
    { name: 'Notifications', href: '/notifications', icon: <Bell className="w-5 h-5" />, permissionKey: 'broadcast' },
    {
        name: 'WhatsApp',
        icon: <MessageCircle className="w-5 h-5" />,
        permissionKey: 'whatsapp',
        children: [
            { name: 'Inbox', href: '/whatsapp', icon: <Inbox className="w-4 h-4" /> },
            { name: 'Contacts', href: '/whatsapp/contacts', icon: <Users className="w-4 h-4" /> },
            { name: 'Broadcast', href: '/whatsapp/broadcast', icon: <Megaphone className="w-4 h-4" /> },
            { name: 'Templates', href: '/whatsapp/templates', icon: <FileText className="w-4 h-4" /> },
            { name: 'Payments', href: '/whatsapp/payments', icon: <CreditCard className="w-4 h-4" /> },
            { name: 'Ad Campaigns', href: '/whatsapp/ad-campaigns', icon: <Target className="w-4 h-4" /> },
            { name: 'Analytics', href: '/whatsapp/analytics', icon: <BarChart3 className="w-4 h-4" /> },
            { name: 'Settings', href: '/whatsapp/settings', icon: <Settings className="w-4 h-4" /> },
        ],
    },
    {
        name: 'CRM',
        icon: <Phone className="w-5 h-5" />,
        permissionKey: 'crm',
        children: [
            { name: 'Worklist', href: '/crm/worklist', icon: <ClipboardList className="w-4 h-4" /> },
            { name: 'All Feedback', href: '/crm/feedback', icon: <MessageSquare className="w-4 h-4" /> },
            { name: 'Call Scripts', href: '/crm/scripts', icon: <FileText className="w-4 h-4" /> },
        ],
    },
    // LMS (Lead Management & Marketing System) — Phase 1 scaffolding;
    // children populate as C-phases ship. (/lms/inbox was removed from the
    // nav 2026-07 — that route was never built.)
    {
        name: 'LMS',
        icon: <Sparkles className="w-5 h-5" />,
        permissionKey: 'lms',
        children: [
            { name: 'Today', href: '/lms', icon: <BarChart3 className="w-4 h-4" /> },
            { name: 'Insights', href: '/lms/insights', icon: <Sparkles className="w-4 h-4" /> },
            { name: 'At-Risk Today', href: '/lms/at-risk', icon: <BarChart3 className="w-4 h-4" /> },
            { name: 'People', href: '/lms/people', icon: <Users className="w-4 h-4" /> },
            { name: 'Leads', href: '/lms/leads', icon: <UserPlus className="w-4 h-4" /> },
            { name: 'Tags', href: '/lms/tags', icon: <Tags className="w-4 h-4" /> },
            { name: 'Segments', href: '/lms/segments', icon: <Tags className="w-4 h-4" /> },
            { name: 'Campaigns', href: '/lms/campaigns', icon: <Megaphone className="w-4 h-4" /> },
            { name: 'Journeys', href: '/lms/journeys', icon: <Workflow className="w-4 h-4" /> },
            { name: 'Inner Circle', href: '/lms/inner-circle', icon: <Sparkles className="w-4 h-4" /> },
            { name: 'WhatsApp Channels', href: '/lms/channels', icon: <Phone className="w-4 h-4" /> },
            { name: 'Privacy & Consent', href: '/lms/settings/privacy', icon: <ShieldCheck className="w-4 h-4" /> },
            { name: 'Agent Cost', href: '/lms/agents/cost', icon: <BarChart3 className="w-4 h-4" /> },
            { name: 'System & Jobs', href: '/lms/system', icon: <BarChart3 className="w-4 h-4" /> },
        ],
    },
    // Accounting (AI-Accountant: GST invoicing, ledgers, Tally). The parent is
    // a pure CONTAINER (no permissionKey) so inventory/production-only staff
    // still reach their sections; gating happens per-leaf via the href segment
    // (accounting / inventory / production).
    {
        name: 'Accounting',
        icon: <Calculator className="w-5 h-5" />,
        children: [
            { name: 'Chart of Accounts', href: '/accounting/accounts', icon: <BookText className="w-4 h-4" /> },
            {
                name: 'Transactions',
                icon: <FileText className="w-4 h-4" />,
                children: [
                    { name: 'Vouchers', href: '/accounting/vouchers', icon: <FileText className="w-4 h-4" /> },
                    { name: 'Invoices', href: '/accounting/invoices', icon: <FileText className="w-4 h-4" /> },
                    { name: 'Shops Billing', href: '/accounting/shops', icon: <Banknote className="w-4 h-4" /> },
                    { name: 'Purchases / Bills', href: '/accounting/purchases', icon: <Receipt className="w-4 h-4" /> },
                    { name: 'Customers', href: '/accounting/customers', icon: <Users className="w-4 h-4" /> },
                    { name: 'HSN & Rates', href: '/accounting/hsn', icon: <Tags className="w-4 h-4" /> },
                    { name: 'B2C Consolidation', href: '/accounting/b2c-consolidation', icon: <CalendarDays className="w-4 h-4" /> },
                ],
            },
            {
                name: 'Reports',
                icon: <BarChart3 className="w-4 h-4" />,
                children: [
                    { name: 'Trial Balance', href: '/accounting/reports/trial-balance', icon: <Calculator className="w-4 h-4" /> },
                    { name: 'Balance Sheet', href: '/accounting/reports/balance-sheet', icon: <BarChart3 className="w-4 h-4" /> },
                    { name: 'Profit & Loss', href: '/accounting/reports/pnl', icon: <TrendingUp className="w-4 h-4" /> },
                    { name: 'Day Book', href: '/accounting/reports/day-book', icon: <CalendarDays className="w-4 h-4" /> },
                    { name: 'Sales Register', href: '/accounting/reports/sales-register', icon: <Receipt className="w-4 h-4" /> },
                    { name: 'GST Returns', href: '/accounting/gst-returns', icon: <Receipt className="w-4 h-4" /> },
                    { name: 'Stock & Valuation', href: '/accounting/stock', icon: <Tags className="w-4 h-4" /> },
                    { name: 'Ledgers', href: '/accounting/ledgers', icon: <BookText className="w-4 h-4" /> },
                    { name: 'Statements', href: '/accounting/statements', icon: <BookText className="w-4 h-4" /> },
                ],
            },
            {
                name: 'Settings',
                icon: <Settings className="w-4 h-4" />,
                children: [
                    { name: 'Overview', href: '/accounting', icon: <Settings className="w-4 h-4" /> },
                    { name: 'Tally', href: '/accounting/tally-settings', icon: <Receipt className="w-4 h-4" /> },
                    { name: 'Tally Reconcile', href: '/accounting/reconcile', icon: <Calculator className="w-4 h-4" /> },
                    { name: 'Opening Balances', href: '/accounting/opening-balances', icon: <BookText className="w-4 h-4" /> },
                    { name: 'Bank Recon', href: '/accounting/bank-reconciliation', icon: <Banknote className="w-4 h-4" /> },
                    { name: 'Reminders', href: '/accounting/reminders', icon: <Bell className="w-4 h-4" /> },
                ],
            },
            // Inventory folded in (keeps its own `inventory` gate via /inventory/* hrefs),
            // with Production nested one level deeper (gated by /production/* hrefs).
            {
                name: 'Inventory',
                icon: <Warehouse className="w-4 h-4" />,
                children: [
                    { name: 'Vendors', href: '/inventory/vendors', icon: <Truck className="w-4 h-4" /> },
                    { name: 'Raw Materials', href: '/inventory/raw-materials', icon: <Boxes className="w-4 h-4" /> },
                    { name: 'Purchases', href: '/inventory/purchases', icon: <Receipt className="w-4 h-4" /> },
                    { name: 'Vendor Payments', href: '/inventory/payments', icon: <Banknote className="w-4 h-4" /> },
                    { name: 'Vendor Ledger', href: '/inventory/ledger', icon: <BookText className="w-4 h-4" /> },
                    { name: 'Purchase Report', href: '/inventory/report', icon: <BarChart3 className="w-4 h-4" /> },
                    { name: 'Cost Prices (Bulk)', href: '/inventory/cost-prices', icon: <Calculator className="w-4 h-4" /> },
                    {
                        name: 'Production',
                        icon: <Factory className="w-4 h-4" />,
                        children: [
                            { name: 'Intermediates', href: '/production/intermediates', icon: <Boxes className="w-4 h-4" /> },
                            { name: 'Recipes', href: '/production/recipes', icon: <FileText className="w-4 h-4" /> },
                            { name: 'Production Records', href: '/production/runs', icon: <ClipboardList className="w-4 h-4" /> },
                            { name: 'Packing', href: '/production/packing', icon: <PackageCheck className="w-4 h-4" /> },
                            { name: 'Write-offs', href: '/production/writeoffs', icon: <Trash2 className="w-4 h-4" /> },
                            { name: 'Reports', href: '/production/reports', icon: <BarChart3 className="w-4 h-4" /> },
                        ],
                    },
                ],
            },
        ],
    },
    // Catch-all for config screens (App Updates, Delivery Locations, Drop
    // Points, Notification Images, Packaging Types were relocated here long
    // ago; Pincodes + CMS joined in the 2026-07 reorg).
    {
        name: 'Settings',
        icon: <Settings className="w-5 h-5" />,
        children: [
            { name: 'General', href: '/settings', icon: <Settings className="w-4 h-4" /> },
            { name: 'Server Health', href: '/settings/server-health', icon: <Activity className="w-4 h-4" /> },
            { name: 'Automation', href: '/settings/automation', icon: <Clock className="w-4 h-4" /> },
            { name: 'Notifications & Templates', href: '/settings/notifications', icon: <Bell className="w-4 h-4" /> },
            { name: 'Notification Mapping', href: '/settings/notification-maps', icon: <Workflow className="w-4 h-4" /> },
            { name: 'Web App', href: '/settings/webapp', icon: <Globe className="w-4 h-4" /> },
            { name: 'Invoice', href: '/settings/invoice', icon: <Receipt className="w-4 h-4" /> },
            { name: 'Payment Gateway', href: '/settings/payment', icon: <Banknote className="w-4 h-4" /> },
            { name: 'Social Media', href: '/settings/social-media', icon: <Share2 className="w-4 h-4" /> },
            { name: 'Refund Reasons', href: '/settings/refund-reasons', icon: <RotateCcw className="w-4 h-4" />, permissionKey: 'refunds' },
            { name: 'Transaction Descriptions', href: '/settings/transaction-descriptions', icon: <Receipt className="w-4 h-4" /> },
            { name: 'Banners', href: '/banners', icon: <Image className="w-4 h-4" /> },
            { name: 'Testimonials', href: '/testimonials', icon: <MessageSquare className="w-4 h-4" /> },
            { name: 'Pages', href: '/pages', icon: <FileText className="w-4 h-4" /> },
            { name: 'App Updates', href: '/app-updates', icon: <Smartphone className="w-4 h-4" />, permissionKey: 'app-updates' },
            { name: 'Delivery Locations', href: '/delivery-locations', icon: <Navigation className="w-4 h-4" /> },
            { name: 'Drop Points', href: '/drop-points', icon: <MapPin className="w-4 h-4" />, permissionKey: 'drop-points' },
            { name: 'Pincodes', href: '/pincodes', icon: <MapPin className="w-4 h-4" /> },
            { name: 'Notification Images', href: '/notifications/images', icon: <Image className="w-4 h-4" />, permissionKey: 'notifications' },
            { name: 'Packaging Types', href: '/packaging-types', icon: <PackageCheck className="w-4 h-4" />, permissionKey: 'packaging' },
            // Phase I — multi-currency + multi-warehouse foundations.
            { name: 'Currencies', href: '/settings/currencies', icon: <Globe className="w-4 h-4" /> },
            { name: 'Warehouses', href: '/settings/warehouses', icon: <Warehouse className="w-4 h-4" /> },
            // CMS (Payload, mounted at /admin via the (payload) route group) —
            // gated by the `cms` permission, opens in a NEW TAB (external).
            { name: 'CMS', href: '/admin', icon: <Globe className="w-4 h-4" />, permissionKey: 'cms', external: true },
        ],
    },
    {
        name: 'Archive',
        icon: <CalendarDays className="w-5 h-5" />,
        children: [
            { name: 'Upcoming Orders', href: '/upcoming-orders', icon: <ShoppingCart className="w-4 h-4" /> },
            { name: 'Upcoming Subs', href: '/upcoming-subs-orders', icon: <CalendarDays className="w-4 h-4" /> },
            { name: 'Pre-Packing List', href: '/production-delivery?tab=prepacking', icon: <Package className="w-4 h-4" /> },
            { name: 'User Holidays', href: '/holidays', icon: <Calendar className="w-4 h-4" /> },
            { name: 'Calendar', href: '/calendar', icon: <Calendar className="w-4 h-4" /> },
            { name: 'Low Wallet', href: '/notifications/low-wallet', icon: <Wallet className="w-4 h-4" /> },
            { name: 'Notification Log', href: '/notifications/log', icon: <Bell className="w-4 h-4" /> },
        ],
    },
];

interface SidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    collapsed?: boolean;
    /** Un-collapse the desktop rail (used by the rail's search button so
     *  focusing search always lands in a visible input). */
    onExpandSidebar?: () => void;
}

/**
 * Derive a permission key from a NavItem's href.
 *   /delivery-list                -> 'delivery-list'
 *   /settings/webapp              -> 'settings'  (settings group lives under one perm)
 *   /admin-users                  -> 'admin-users'
 *   ''  / undefined               -> undefined   (group items with no direct href)
 *
 * The keys we return MUST match entries in AVAILABLE_PERMISSIONS in
 * roles/page.tsx — otherwise an admin who restricts a role's permissions
 * to anything other than "full access" can lose nav entries unexpectedly.
 * For nav items whose first path segment isn't in AVAILABLE_PERMISSIONS we
 * return undefined and the filter keeps them visible (safe default).
 */
const KNOWN_PERMISSION_KEYS = new Set([
    'dashboard', 'users', 'drivers', 'orders', 'products', 'categories',
    'subcategories', 'delivery-list', 'delivery-report', 'transactions',
    'banners', 'testimonials', 'pincodes', 'settings', 'notifications',
    'admin-users', 'roles', 'production-delivery', 'cms', 'whatsapp',
    'crm', 'inventory', 'production', 'refunds', 'payroll',
    'app-updates', 'drop-points', 'broadcast', 'packaging', 'day-orders',
    'lms',
    // AI-Accountant section (GST invoicing, ledgers, Tally sync, bank recon).
    'accounting',
    // Variations feature (migration 030 / D-7). Gates the /attributes
    // library and the per-product /products/:id/variations editor.
    'attributes',
    // Review moderation (migration 033 / Phase H).
    'reviews',
    // Business Pulse (Phase 5) — CEO dashboard over the v_pulse_* views.
    'business-pulse',
    // Stall POS (migration 113). Two keys on purpose: 'pos' is the till a
    // market-stall operator needs and NOTHING else; 'stalls' is the office-side
    // menu and price management, which they must not have.
    'pos',
    'stalls',
]);

const navItemPermission = (item: NavItem): string | undefined => {
    // Explicit override wins — used by the CMS entry whose href (/admin)
    // doesn't match its permission key (cms).
    if (item.permissionKey && KNOWN_PERMISSION_KEYS.has(item.permissionKey)) {
        return item.permissionKey;
    }
    if (!item.href) return undefined;
    const seg = item.href.split('/')[1];
    if (seg && KNOWN_PERMISSION_KEYS.has(seg)) return seg;
    return undefined;
};

const filterNav = (
    items: NavItem[],
    hasPermission: (key: string) => boolean,
): NavItem[] => {
    const result: NavItem[] = [];
    for (const item of items) {
        if (item.children) {
            const filteredChildren = filterNav(item.children, hasPermission);
            if (filteredChildren.length === 0) continue;
            result.push({ ...item, children: filteredChildren });
            continue;
        }
        const key = navItemPermission(item);
        if (!key) {
            // No permission key derivable — leave visible (safe default).
            result.push(item);
            continue;
        }
        if (hasPermission(key)) result.push(item);
    }
    return result;
};

/** Remove a leaf by href ANYWHERE in the tree, dropping groups that empty out.
 *  (The old top-level `.filter()` silently stopped working once Attributes
 *  moved into the Products group.) */
const stripByHref = (items: NavItem[], href: string): NavItem[] =>
    items.flatMap((item): NavItem[] => {
        if (item.href === href) return [];
        if (!item.children) return [item];
        const kids = stripByHref(item.children, href);
        return kids.length ? [{ ...item, children: kids }] : [];
    });

/** First navigable LEAF at/under an item — the collapsed icon-rail can't
 *  expand groups, so its icon links to this leaf (honouring `external`). */
const firstLeaf = (item: NavItem): NavItem | undefined => {
    if (item.href) return item;
    for (const child of item.children ?? []) {
        const leaf = firstLeaf(child);
        if (leaf) return leaf;
    }
    return undefined;
};

/** Case-insensitive substring filter over item names. A matching group keeps
 *  its whole subtree; a matching leaf keeps its ancestor chain. */
const filterByQuery = (items: NavItem[], q: string): NavItem[] => {
    const out: NavItem[] = [];
    for (const item of items) {
        const selfMatch = item.name.toLowerCase().includes(q);
        if (item.children) {
            if (selfMatch) {
                out.push(item);
                continue;
            }
            const kids = filterByQuery(item.children, q);
            if (kids.length) out.push({ ...item, children: kids });
            continue;
        }
        if (selfMatch) out.push(item);
    }
    return out;
};

/** Every group key (path-keyed like renderNode: "Accounting/Reports") in a
 *  tree — search results render with all their groups forced open. */
const collectGroupKeys = (
    items: NavItem[],
    parentKey = '',
    acc: Set<string> = new Set(),
): Set<string> => {
    for (const item of items) {
        const key = parentKey ? `${parentKey}/${item.name}` : item.name;
        if (item.children && item.children.length) {
            acc.add(key);
            collectGroupKeys(item.children, key, acc);
        }
    }
    return acc;
};

// Expanded-groups persistence (localStorage). Restored in a mount effect —
// NOT the useState initializer — for the same SSR-hydration reason the layout
// restores 'sidebar-collapsed' in an effect.
const EXPANDED_STORAGE_KEY = 'sidebar-expanded';

export default function Sidebar({ isOpen, onToggle, collapsed = false, onExpandSidebar }: SidebarProps) {
    const pathname = usePathname();
    const { hasPermission } = useAuth();
    const [expandedItems, setExpandedItems] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const hydratedRef = useRef(false);
    // Variations (migration 030). app_setting key `enable_variations` gates
    // the Attributes nav entry per-tenant. Default OFF until the operator
    // opts in — keeps the admin clean for tenants that don't use variations.
    const variationsEnabled = useFeatureFlag('enable_variations', false);

    // Filter the nav by the active user's role permissions THEN strip
    // Attributes when the variations flag is off. Two-stage filter so role-
    // based visibility logic stays untouched.
    const visibleNavItems = useMemo(() => {
        const roleFiltered = filterNav(navItems, hasPermission);
        if (variationsEnabled) return roleFiltered;
        return stripByHref(roleFiltered, '/attributes');
    }, [hasPermission, variationsEnabled]);

    // Sidebar search — filters the permission-filtered tree; while searching,
    // every surviving group is forced open (forcedExpanded overrides the
    // user's expandedItems without mutating it).
    const query = searchQuery.trim().toLowerCase();
    const searching = query.length > 0;
    const displayedNavItems = useMemo(
        () => (searching ? filterByQuery(visibleNavItems, query) : visibleNavItems),
        [visibleNavItems, query, searching],
    );
    const forcedExpanded = useMemo(
        () => (searching ? collectGroupKeys(displayedNavItems) : null),
        [displayedNavItems, searching],
    );

    // Expansion is keyed by the '/'-joined name PATH (e.g. "Accounting/Settings")
    // not the bare name, so duplicate labels at different depths (two "Settings",
    // two "Reports") expand independently.
    const toggleExpand = (key: string) => {
        setExpandedItems(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    // Restore persisted expanded groups once on mount, then persist on change.
    // The restore merges (union) so the active-route auto-expand below never
    // fights it; the hydratedRef guard keeps the first render's empty state
    // from mattering (we already read the stored value into memory).
    useEffect(() => {
        try {
            const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
            if (raw) {
                const saved: unknown = JSON.parse(raw);
                if (Array.isArray(saved)) {
                    const keys = saved.filter((s): s is string => typeof s === 'string');
                    if (keys.length) {
                        setExpandedItems(prev => Array.from(new Set([...prev, ...keys])));
                    }
                }
            }
        } catch {
            // Corrupted stored state — start fresh.
        }
        hydratedRef.current = true;
    }, []);
    useEffect(() => {
        if (!hydratedRef.current) return;
        try {
            localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expandedItems));
        } catch {
            // Storage unavailable (private mode / quota) — expansion just won't persist.
        }
    }, [expandedItems]);

    // Every href anywhere in the visible tree (recursive) — used to decide whether
    // a prefix match is safe (don't light up a parent route when a child is active).
    // Reads the FULL visible tree (not the search-filtered one) so active-route
    // detection stays stable mid-search.
    const allHrefs = useMemo(() => {
        const acc: string[] = [];
        const walk = (items: NavItem[]) => items.forEach((i) => {
            if (i.href) acc.push(i.href);
            if (i.children) walk(i.children);
        });
        walk(visibleNavItems);
        return acc;
    }, [visibleNavItems]);

    const isActive = (href: string) => {
        if (pathname === href) return true;
        const hasSibling = allHrefs.some(h => h !== href && h.startsWith(href + '/'));
        if (hasSibling) return false;
        return pathname.startsWith(href + '/');
    };

    /** Any leaf under this item active? Lights the collapsed rail's group icons. */
    const subtreeHasActive = (item: NavItem): boolean => {
        if (item.href && !item.external && isActive(item.href)) return true;
        return (item.children ?? []).some(subtreeHasActive);
    };

    // Auto-expand the FULL ancestor chain (Accounting ▸ Inventory ▸ Production …)
    // of the active page.
    useEffect(() => {
        const out: string[] = [];
        const walk = (items: NavItem[], parentKey: string): boolean => {
            let active = false;
            for (const item of items) {
                const key = parentKey ? `${parentKey}/${item.name}` : item.name;
                if (item.children && item.children.length) {
                    if (walk(item.children, key)) { out.push(key); active = true; }
                } else if (item.href && isActive(item.href)) {
                    active = true;
                }
            }
            return active;
        };
        walk(visibleNavItems, '');
        // Sync the open sections to the active URL (same pattern the page-level
        // data→state effects use). Additive — user toggles are preserved.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (out.length) setExpandedItems(prev => Array.from(new Set([...prev, ...out])));
    }, [pathname, visibleNavItems]); // eslint-disable-line react-hooks/exhaustive-deps

    // Render one nav node at `depth` under `parentKey` — recurses into children so
    // the tree supports arbitrary nesting (the old renderer was one level deep).
    const renderNode = (item: NavItem, depth: number, parentKey: string): React.ReactNode => {
        const key = parentKey ? `${parentKey}/${item.name}` : item.name;
        if (item.children && item.children.length) {
            const expanded = forcedExpanded ? forcedExpanded.has(key) : expandedItems.includes(key);
            return (
                <div>
                    <button
                        onClick={() => toggleExpand(key)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all duration-200"
                    >
                        <div className="flex items-center gap-3">
                            {item.icon}
                            <span className={depth === 0 ? 'font-medium' : 'text-sm font-medium'}>{item.name}</span>
                        </div>
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    {expanded && (
                        <ul className="ml-4 mt-1 space-y-1 border-l border-slate-800 pl-4">
                            {item.children.map(child => (
                                <li key={`${key}/${child.name}`}>{renderNode(child, depth + 1, key)}</li>
                            ))}
                        </ul>
                    )}
                </div>
            );
        }
        const active = !item.external && isActive(item.href!);
        const leafClasses = `flex items-center gap-3 px-3 ${depth === 0 ? 'py-2.5' : 'py-2'} rounded-lg transition-all duration-200 ${active
            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
            : `${depth === 0 ? 'text-slate-300' : 'text-slate-400'} hover:bg-slate-800/50 hover:text-white`}`;
        const clearSearch = () => { if (searchQuery) setSearchQuery(''); };
        if (item.external) {
            return (
                <a href={item.href!} target="_blank" rel="noopener noreferrer" className={leafClasses} onClick={clearSearch}>
                    {item.icon}
                    <span className={depth === 0 ? 'font-medium' : 'text-sm'}>{item.name}</span>
                </a>
            );
        }
        return (
            <Link href={item.href!} className={leafClasses} onClick={clearSearch}>
                {item.icon}
                <span className={depth === 0 ? 'font-medium' : 'text-sm'}>{item.name}</span>
            </Link>
        );
    };

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={onToggle}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed lg:sticky top-0 left-0 z-50
                    h-screen ${collapsed ? 'w-[68px]' : 'w-72'}
                    bg-slate-900/95 backdrop-blur-xl
                    border-r border-slate-800/50
                    flex flex-col
                    transform transition-all duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
            >
                {/* Logo */}
                <div className={`${collapsed ? 'p-3' : 'p-5'} border-b border-slate-800/50`}>
                    <div className="flex items-center justify-between">
                        <div className={`flex items-center ${collapsed ? 'justify-center w-full' : 'gap-3'}`}>
                            <div className={`${collapsed ? 'w-9 h-9' : 'w-10 h-10'} bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25 flex-shrink-0`}>
                                <LayoutDashboard className="w-5 h-5 text-white" />
                            </div>
                            {!collapsed && (
                                <div>
                                    <h1 className="font-bold text-white text-lg leading-tight">
                                        {BRANDING.appName}
                                    </h1>
                                    <p className="text-xs text-slate-400">Admin Panel</p>
                                </div>
                            )}
                        </div>
                        {!collapsed && (
                            <button
                                onClick={onToggle}
                                className="lg:hidden p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Menu search */}
                {!collapsed && (
                    <div className="px-3 pt-4">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        setSearchQuery('');
                                        (e.target as HTMLInputElement).blur();
                                    }
                                }}
                                placeholder="Search menu…"
                                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-white transition-colors"
                                    title="Clear search"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {collapsed && (
                    <div className="px-2 pt-3">
                        <button
                            onClick={() => {
                                onExpandSidebar?.();
                                setTimeout(() => searchInputRef.current?.focus(), 50);
                            }}
                            className="w-full flex items-center justify-center p-2.5 rounded-lg text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all duration-200"
                            title="Search menu"
                        >
                            <Search className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {/* Navigation */}
                <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
                    <ul className="space-y-1">
                        {displayedNavItems.map((item) => {
                            const railLeaf = collapsed ? firstLeaf(item) : undefined;
                            return (
                                <li key={item.name}>
                                    {collapsed ? (
                                        /* Collapsed icon-rail: groups can't expand, so link to
                                           the first navigable leaf at/under the item. */
                                        <Link
                                            href={railLeaf?.href || '#'}
                                            target={railLeaf?.external ? '_blank' : undefined}
                                            rel={railLeaf?.external ? 'noopener noreferrer' : undefined}
                                            className={`
                                                flex items-center justify-center p-2.5 rounded-lg
                                                transition-all duration-200
                                                ${subtreeHasActive(item)
                                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                                                }
                                            `}
                                            title={item.name}
                                        >
                                            {item.icon}
                                        </Link>
                                    ) : (
                                        renderNode(item, 0, '')
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    {searching && displayedNavItems.length === 0 && (
                        <p className="px-3 py-6 text-sm text-slate-500 text-center">
                            No menu items match &ldquo;{searchQuery}&rdquo;
                        </p>
                    )}
                </nav>
            </aside>
        </>
    );
}

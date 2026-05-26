'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { BRANDING } from '@/config/tenant';
import { useAuth } from '@/lib/auth';
import {
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
    Menu,
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
}

const navItems: NavItem[] = [
    // 0: Dashboard
    { name: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    // --- Operations --- (divider after 0)
    // 1
    { name: 'Delivery List', href: '/delivery-list', icon: <ClipboardList className="w-5 h-5" /> },
    // --- Reports --- (divider after 1)
    // 2-3
    { name: 'Delivery Report', href: '/delivery-report', icon: <BarChart3 className="w-5 h-5" /> },
    { name: 'Performance Report', href: '/performance-report', icon: <TrendingUp className="w-5 h-5" /> },
    // --- People --- (divider after 3)
    // 4-5
    { name: 'Users', href: '/users', icon: <Users className="w-5 h-5" /> },
    { name: 'Drivers', href: '/drivers', icon: <Truck className="w-5 h-5" /> },
    // --- Catalog --- (divider after 5)
    // 6-8
    { name: 'Categories', href: '/categories', icon: <FolderTree className="w-5 h-5" /> },
    { name: 'Subcategories', href: '/subcategories', icon: <Layers className="w-5 h-5" /> },
    { name: 'Products', href: '/products', icon: <Package className="w-5 h-5" /> },
    // --- Orders & Finance --- (divider after 8)
    // 9-11
    { name: 'Orders', href: '/orders', icon: <ShoppingCart className="w-5 h-5" /> },
    { name: 'Day Orders', href: '/day-orders', icon: <Sun className="w-5 h-5" />, permissionKey: 'day-orders' },
    { name: 'Transactions', href: '/transactions', icon: <CreditCard className="w-5 h-5" /> },
    // 11
    { name: 'Refunds', href: '/refunds', icon: <RotateCcw className="w-5 h-5" />, permissionKey: 'refunds' },
    // 12
    { name: 'Payroll', href: '/payroll', icon: <Banknote className="w-5 h-5" />, permissionKey: 'payroll' },
    // 13 — Feature 07 returnable packaging (Packaging Types moved into Settings)
    { name: 'Returns & Refunds', href: '/returns-refunds', icon: <RotateCcw className="w-5 h-5" />, permissionKey: 'packaging' },
    // --- Settings --- (divider after 13)
    // Catch-all for config screens. Five entries (App Updates, Delivery
    // Locations, Drop Points, Notification Images, Packaging Types) were
    // relocated here from the top-level nav to declutter the sidebar —
    // they're all infrequently-edited config rather than daily ops.
    // 14
    {
        name: 'Settings',
        icon: <Settings className="w-5 h-5" />,
        children: [
            { name: 'General', href: '/settings', icon: <Settings className="w-4 h-4" /> },
            { name: 'Automation', href: '/settings/automation', icon: <Clock className="w-4 h-4" /> },
            { name: 'Notifications & Templates', href: '/settings/notifications', icon: <Bell className="w-4 h-4" /> },
            { name: 'Web App', href: '/settings/webapp', icon: <Globe className="w-4 h-4" /> },
            { name: 'Invoice', href: '/settings/invoice', icon: <Receipt className="w-4 h-4" /> },
            { name: 'Payment Gateway', href: '/settings/payment', icon: <Banknote className="w-4 h-4" /> },
            { name: 'Social Media', href: '/settings/social-media', icon: <Share2 className="w-4 h-4" /> },
            { name: 'Refund Reasons', href: '/settings/refund-reasons', icon: <RotateCcw className="w-4 h-4" />, permissionKey: 'refunds' },
            { name: 'Banners', href: '/banners', icon: <Image className="w-4 h-4" /> },
            { name: 'Testimonials', href: '/testimonials', icon: <MessageSquare className="w-4 h-4" /> },
            { name: 'Pages', href: '/pages', icon: <FileText className="w-4 h-4" /> },
            // Moved from top-level — config that's edited rarely.
            { name: 'App Updates', href: '/app-updates', icon: <Smartphone className="w-4 h-4" />, permissionKey: 'app-updates' },
            { name: 'Delivery Locations', href: '/delivery-locations', icon: <Navigation className="w-4 h-4" /> },
            { name: 'Drop Points', href: '/drop-points', icon: <MapPin className="w-4 h-4" />, permissionKey: 'drop-points' },
            { name: 'Notification Images', href: '/notifications/images', icon: <Image className="w-4 h-4" />, permissionKey: 'notifications' },
            { name: 'Packaging Types', href: '/packaging-types', icon: <PackageCheck className="w-4 h-4" />, permissionKey: 'packaging' },
        ],
    },
    // --- Location & Notifications --- (divider after 15)
    // 16-18 (Delivery Locations, Drop Points, Notification Images, App Updates moved into Settings)
    { name: 'Pincodes', href: '/pincodes', icon: <MapPin className="w-5 h-5" /> },
    { name: 'Notifications', href: '/notifications', icon: <Bell className="w-5 h-5" /> },
    { name: 'Broadcast', href: '/broadcast', icon: <Megaphone className="w-5 h-5" />, permissionKey: 'broadcast' },
    // --- Communications (WhatsApp) --- (divider after 14)
    // 15
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
    // --- CRM --- (divider after 15)
    // 16
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
    // --- LMS (Lead Management & Marketing System) --- (divider after 16)
    // 17 — Phase 1 scaffolding; children populate as C-phases ship.
    {
        name: 'LMS',
        icon: <Sparkles className="w-5 h-5" />,
        permissionKey: 'lms',
        children: [
            { name: 'Today', href: '/lms', icon: <BarChart3 className="w-4 h-4" /> },
            { name: 'People', href: '/lms/people', icon: <Users className="w-4 h-4" /> },
            { name: 'Leads', href: '/lms/leads', icon: <UserPlus className="w-4 h-4" /> },
            { name: 'Tags', href: '/lms/tags', icon: <Tags className="w-4 h-4" /> },
            { name: 'Segments', href: '/lms/segments', icon: <Tags className="w-4 h-4" /> },
            { name: 'Campaigns', href: '/lms/campaigns', icon: <Megaphone className="w-4 h-4" /> },
            { name: 'Journeys', href: '/lms/journeys', icon: <Workflow className="w-4 h-4" /> },
            { name: 'Inbox', href: '/lms/inbox', icon: <Inbox className="w-4 h-4" /> },
            { name: 'Inner Circle', href: '/lms/inner-circle', icon: <Sparkles className="w-4 h-4" /> },
            { name: 'WhatsApp Channels', href: '/lms/channels', icon: <Phone className="w-4 h-4" /> },
            { name: 'Privacy & Consent', href: '/lms/settings/privacy', icon: <ShieldCheck className="w-4 h-4" /> },
            { name: 'Agent Cost', href: '/lms/agents/cost', icon: <BarChart3 className="w-4 h-4" /> },
            { name: 'System & Jobs', href: '/lms/system', icon: <BarChart3 className="w-4 h-4" /> },
        ],
    },
    // --- Archive --- (divider after 17)
    // 18
    {
        name: 'Archive',
        icon: <CalendarDays className="w-5 h-5" />,
        children: [
            { name: 'Upcoming Orders', href: '/upcoming-orders', icon: <ShoppingCart className="w-4 h-4" /> },
            { name: 'Upcoming Subs', href: '/upcoming-subs-orders', icon: <CalendarDays className="w-4 h-4" /> },
            { name: 'Pre-Packing List', href: '/pre-packing-list', icon: <Package className="w-4 h-4" /> },
            { name: 'User Holidays', href: '/holidays', icon: <Calendar className="w-4 h-4" /> },
            { name: 'Calendar', href: '/calendar', icon: <Calendar className="w-4 h-4" /> },
            { name: 'Low Wallet', href: '/notifications/low-wallet', icon: <Wallet className="w-4 h-4" /> },
        ],
    },
    // --- Admin --- (divider after 16)
    // 17-18
    { name: 'Admin Users', href: '/admin-users', icon: <Users className="w-5 h-5" /> },
    { name: 'Roles & Permissions', href: '/roles', icon: <Settings className="w-5 h-5" /> },
    // Stock-sync UI: links MySQL ops products with Payload web products so
    // stock is managed in one place (the existing /products screen).
    { name: 'Product Sync', href: '/product-sync', icon: <Package className="w-5 h-5" />, permissionKey: 'product-sync' },
    // --- CMS --- (Payload, mounted at /admin via Next route group (payload))
    // The Topbar Operations↔CMS toggle uses the same route. Adding a sidebar
    // entry lets a role be granted CMS access without exposing the toggle to
    // everyone — gated by the `cms` permission below.
    { name: 'CMS', href: '/admin', icon: <Globe className="w-5 h-5" />, permissionKey: 'cms' },
    // --- Inventory --- (divider after 20 / CMS)
    // 21
    {
        name: 'Inventory',
        icon: <Warehouse className="w-5 h-5" />,
        permissionKey: 'inventory',
        children: [
            { name: 'Vendors', href: '/inventory/vendors', icon: <Truck className="w-4 h-4" /> },
            { name: 'Raw Materials', href: '/inventory/raw-materials', icon: <Boxes className="w-4 h-4" /> },
            { name: 'Purchases', href: '/inventory/purchases', icon: <Receipt className="w-4 h-4" /> },
            { name: 'Vendor Payments', href: '/inventory/payments', icon: <Banknote className="w-4 h-4" /> },
            { name: 'Vendor Ledger', href: '/inventory/ledger', icon: <BookText className="w-4 h-4" /> },
            { name: 'Purchase Report', href: '/inventory/report', icon: <BarChart3 className="w-4 h-4" /> },
        ],
    },
    // --- Production --- (no divider — same block as Inventory)
    // 22
    {
        name: 'Production',
        icon: <Factory className="w-5 h-5" />,
        permissionKey: 'production',
        children: [
            { name: 'Intermediates', href: '/production/intermediates', icon: <Boxes className="w-4 h-4" /> },
            { name: 'Recipes', href: '/production/recipes', icon: <FileText className="w-4 h-4" /> },
            { name: 'Production Records', href: '/production/runs', icon: <ClipboardList className="w-4 h-4" /> },
            { name: 'Write-offs', href: '/production/writeoffs', icon: <Trash2 className="w-4 h-4" /> },
            { name: 'Reports', href: '/production/reports', icon: <BarChart3 className="w-4 h-4" /> },
        ],
    },
];

interface SidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    collapsed?: boolean;
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
    'product-sync', 'crm', 'inventory', 'production', 'refunds', 'payroll',
    'app-updates', 'drop-points', 'broadcast', 'packaging', 'day-orders',
    'lms',
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

export default function Sidebar({ isOpen, onToggle, collapsed = false }: SidebarProps) {
    const pathname = usePathname();
    const { hasPermission } = useAuth();
    const [expandedItems, setExpandedItems] = useState<string[]>([]);

    // Filter the nav by the active user's role permissions. Full-access users
    // see everything (hasPermission returns true for every key); specific-perm
    // users see only the entries their role grants.
    const visibleNavItems = useMemo(
        () => filterNav(navItems, hasPermission),
        [hasPermission]
    );

    const toggleExpand = (name: string) => {
        setExpandedItems(prev =>
            prev.includes(name)
                ? prev.filter(item => item !== name)
                : [...prev, name]
        );
    };

    const isActive = (href: string) => {
        if (pathname === href) return true;
        // For /pages, also match /pages/about, /pages/privacy, etc.
        // For /settings, do NOT match /settings/webapp (sibling routes)
        // Only allow prefix matching when there are no sibling routes sharing the prefix
        const allChildHrefs = visibleNavItems.flatMap(i => i.children?.map(c => c.href) || []);
        const hasSibling = allChildHrefs.some(h => h !== href && h?.startsWith(href + '/'));
        if (hasSibling) return false;
        return pathname.startsWith(href + '/');
    };

    // Auto-expand the group containing the active page
    useEffect(() => {
        visibleNavItems.forEach(item => {
            if (item.children?.some(c => c.href && isActive(c.href!))) {
                setExpandedItems(prev => prev.includes(item.name) ? prev : [...prev, item.name]);
            }
        });
    }, [pathname, visibleNavItems]);

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

                {/* Navigation */}
                <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
                    <ul className="space-y-1">
                        {visibleNavItems.map((item, index) => (
                            <li key={item.name}>
                                {item.children ? (
                                    collapsed ? (
                                        /* Collapsed: show first child link as icon-only */
                                        <Link
                                            href={item.children[0]?.href || '#'}
                                            className={`
                                                flex items-center justify-center p-2.5 rounded-lg
                                                transition-all duration-200
                                                text-slate-300 hover:bg-slate-800/50 hover:text-white
                                            `}
                                            title={item.name}
                                        >
                                            {item.icon}
                                        </Link>
                                    ) : (
                                        <div>
                                            <button
                                                onClick={() => toggleExpand(item.name)}
                                                className={`
                                                    w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg
                                                    text-slate-300 hover:bg-slate-800/50 hover:text-white
                                                    transition-all duration-200
                                                `}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {item.icon}
                                                    <span className="font-medium">{item.name}</span>
                                                </div>
                                                {expandedItems.includes(item.name) ? (
                                                    <ChevronDown className="w-4 h-4" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4" />
                                                )}
                                            </button>
                                            {expandedItems.includes(item.name) && (
                                                <ul className="ml-4 mt-1 space-y-1 border-l border-slate-800 pl-4">
                                                    {item.children.map(child => (
                                                        <li key={child.href}>
                                                            <Link
                                                                href={child.href!}
                                                                className={`
                                                                    flex items-center gap-3 px-3 py-2 rounded-lg
                                                                    transition-all duration-200
                                                                    ${isActive(child.href!)
                                                                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                                                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                                                                    }
                                                                `}
                                                            >
                                                                {child.icon}
                                                                <span className="text-sm">{child.name}</span>
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )
                                ) : collapsed ? (
                                    <Link
                                        href={item.href!}
                                        className={`
                                            flex items-center justify-center p-2.5 rounded-lg
                                            transition-all duration-200
                                            ${isActive(item.href!)
                                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                                : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                                            }
                                        `}
                                        title={item.name}
                                    >
                                        {item.icon}
                                    </Link>
                                ) : (
                                    <Link
                                        href={item.href!}
                                        className={`
                                            flex items-center gap-3 px-3 py-2.5 rounded-lg
                                            transition-all duration-200
                                            ${isActive(item.href!)
                                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                                : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                                            }
                                        `}
                                    >
                                        {item.icon}
                                        <span className="font-medium">{item.name}</span>
                                    </Link>
                                )}
                                {/* Section dividers */}
                                {/* Section dividers — recomputed after the five top-level
                                    items (App Updates / Delivery Locations / Drop Points /
                                    Notification Images / Packaging Types) moved into Settings.
                                    Each new index = old index minus the count of removed
                                    entries at or below the old index. */}
                                {/* Inserting LMS at index 17 (between CRM and Archive) shifted
                                    every subsequent divider up by 1. New divider after LMS
                                    (17) separates it from Archive (18). */}
                                {!collapsed && (index === 0 || index === 1 || index === 3 || index === 5 || index === 8 || index === 13 || index === 14 || index === 15 || index === 17 || index === 19 || index === 20 || index === 21 || index === 22 || index === 26 || index === 27) && (
                                    <div className="my-3 border-t border-slate-800/50" />
                                )}
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>
        </>
    );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BRANDING } from '@/config/tenant';
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
} from 'lucide-react';

interface NavItem {
    name: string;
    href?: string;
    icon: React.ReactNode;
    children?: NavItem[];
}

const navItems: NavItem[] = [
    {
        name: 'Dashboard',
        href: '/dashboard',
        icon: <LayoutDashboard className="w-5 h-5" />,
    },
    // --- Operations ---
    {
        name: 'Delivery List',
        href: '/delivery-list',
        icon: <ClipboardList className="w-5 h-5" />,
    },
    {
        name: 'Packing List',
        href: '/packing-list',
        icon: <Package className="w-5 h-5" />,
    },
    {
        name: 'Pre-Packing List',
        href: '/pre-packing-list',
        icon: <Package className="w-5 h-5" />,
    },
    {
        name: 'Routewise Products',
        href: '/routewise-products',
        icon: <Navigation className="w-5 h-5" />,
    },
    {
        name: 'Dairy Pickup',
        href: '/dairy-pickup',
        icon: <Package className="w-5 h-5" />,
    },
    // --- Reports ---
    {
        name: 'Delivery Report',
        href: '/delivery-report',
        icon: <BarChart3 className="w-5 h-5" />,
    },
    {
        name: 'Performance Report',
        href: '/performance-report',
        icon: <TrendingUp className="w-5 h-5" />,
    },
    // --- People ---
    {
        name: 'Users',
        href: '/users',
        icon: <Users className="w-5 h-5" />,
    },
    {
        name: 'Drivers',
        href: '/drivers',
        icon: <Truck className="w-5 h-5" />,
    },
    // --- Catalog ---
    {
        name: 'Categories',
        href: '/categories',
        icon: <FolderTree className="w-5 h-5" />,
    },
    {
        name: 'Subcategories',
        href: '/subcategories',
        icon: <Layers className="w-5 h-5" />,
    },
    {
        name: 'Products',
        href: '/products',
        icon: <Package className="w-5 h-5" />,
    },
    // --- Orders ---
    {
        name: 'Orders',
        href: '/orders',
        icon: <ShoppingCart className="w-5 h-5" />,
    },
    {
        name: 'Upcoming Orders',
        href: '/upcoming-orders',
        icon: <ShoppingCart className="w-5 h-5" />,
    },
    {
        name: 'Upcoming Subs Orders',
        href: '/upcoming-subs-orders',
        icon: <CalendarDays className="w-5 h-5" />,
    },
    {
        name: 'User Holidays',
        href: '/holidays',
        icon: <CalendarDays className="w-5 h-5" />,
    },
    {
        name: 'Calendar',
        href: '/calendar',
        icon: <Calendar className="w-5 h-5" />,
    },
    {
        name: 'Transactions',
        href: '/transactions',
        icon: <CreditCard className="w-5 h-5" />,
    },
    // --- Content ---
    {
        name: 'Banners',
        href: '/banners',
        icon: <Image className="w-5 h-5" />,
    },
    {
        name: 'Pages',
        icon: <FileText className="w-5 h-5" />,
        children: [
            { name: 'About Us', href: '/pages/about', icon: <FileText className="w-4 h-4" /> },
            { name: 'Privacy Policy', href: '/pages/privacy', icon: <FileText className="w-4 h-4" /> },
            { name: 'Terms', href: '/pages/terms', icon: <FileText className="w-4 h-4" /> },
            { name: 'Refund Policy', href: '/pages/refund', icon: <FileText className="w-4 h-4" /> },
            { name: 'FAQ', href: '/pages/faq', icon: <FileText className="w-4 h-4" /> },
        ],
    },
    {
        name: 'Testimonials',
        href: '/testimonials',
        icon: <MessageSquare className="w-5 h-5" />,
    },
    {
        name: 'Notifications',
        href: '/notifications',
        icon: <Bell className="w-5 h-5" />,
    },
    // --- Configuration ---
    {
        name: 'Settings',
        icon: <Settings className="w-5 h-5" />,
        children: [
            { name: 'General', href: '/settings', icon: <Settings className="w-4 h-4" /> },
            { name: 'Web App', href: '/settings/webapp', icon: <Globe className="w-4 h-4" /> },
            { name: 'Invoice', href: '/settings/invoice', icon: <Receipt className="w-4 h-4" /> },
            { name: 'Payment Gateway', href: '/settings/payment', icon: <Banknote className="w-4 h-4" /> },
            { name: 'Social Media', href: '/settings/social-media', icon: <Share2 className="w-4 h-4" /> },
        ],
    },
    {
        name: 'Pincodes',
        href: '/pincodes',
        icon: <MapPin className="w-5 h-5" />,
    },
    {
        name: 'Delivery Location',
        href: '/delivery-locations',
        icon: <Navigation className="w-5 h-5" />,
    },
    {
        name: 'Low Wallet Notification',
        href: '/notifications/low-wallet',
        icon: <Wallet className="w-5 h-5" />,
    },
    // --- Admin ---
    {
        name: 'Admin Users',
        href: '/admin-users',
        icon: <Users className="w-5 h-5" />,
    },
    {
        name: 'Roles & Permissions',
        href: '/roles',
        icon: <Settings className="w-5 h-5" />,
    },
];

interface SidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    collapsed?: boolean;
}

export default function Sidebar({ isOpen, onToggle, collapsed = false }: SidebarProps) {
    const pathname = usePathname();
    const [expandedItems, setExpandedItems] = useState<string[]>([]);

    const toggleExpand = (name: string) => {
        setExpandedItems(prev =>
            prev.includes(name)
                ? prev.filter(item => item !== name)
                : [...prev, name]
        );
    };

    const isActive = (href: string) => {
        return pathname === href || pathname.startsWith(href + '/');
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

                {/* Navigation */}
                <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
                    <ul className="space-y-1">
                        {navItems.map((item, index) => (
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
                                {!collapsed && (index === 0 || index === 5 || index === 7 || index === 9 || index === 12 || index === 18 || index === 22 || index === 26) && (
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

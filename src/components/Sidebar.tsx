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
        name: 'Delivery List',
        href: '/delivery-list',
        icon: <ClipboardList className="w-5 h-5" />,
    },
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
    {
        name: 'Orders',
        href: '/orders',
        icon: <ShoppingCart className="w-5 h-5" />,
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
        name: 'Pincodes',
        href: '/pincodes',
        icon: <MapPin className="w-5 h-5" />,
    },
    {
        name: 'Testimonials',
        href: '/testimonials',
        icon: <MessageSquare className="w-5 h-5" />,
    },
    {
        name: 'Settings',
        href: '/settings',
        icon: <Settings className="w-5 h-5" />,
    },
    {
        name: 'Notifications',
        href: '/notifications',
        icon: <Bell className="w-5 h-5" />,
    },
    {
        name: 'Low Wallet Notification',
        href: '/notifications/low-wallet',
        icon: <Wallet className="w-5 h-5" />,
    },
    {
        name: 'Web App Setting',
        href: '/settings/webapp',
        icon: <Globe className="w-5 h-5" />,
    },
    {
        name: 'Invoice Setting',
        href: '/settings/invoice',
        icon: <Receipt className="w-5 h-5" />,
    },
    {
        name: 'Delivery Location',
        href: '/delivery-locations',
        icon: <Navigation className="w-5 h-5" />,
    },
    {
        name: 'Payment Gateway',
        href: '/settings/payment',
        icon: <Banknote className="w-5 h-5" />,
    },
    {
        name: 'Social Media',
        href: '/settings/social-media',
        icon: <Share2 className="w-5 h-5" />,
    },
    {
        name: 'Upcoming Orders',
        href: '/upcoming-orders',
        icon: <Package className="w-5 h-5" />,
    },
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
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
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
                    h-screen w-72
                    bg-slate-900/95 backdrop-blur-xl
                    border-r border-slate-800/50
                    flex flex-col
                    transform transition-transform duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
            >
                {/* Logo */}
                <div className="p-5 border-b border-slate-800/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
                                <LayoutDashboard className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="font-bold text-white text-lg leading-tight">
                                    {BRANDING.appName}
                                </h1>
                                <p className="text-xs text-slate-400">Admin Panel</p>
                            </div>
                        </div>
                        <button
                            onClick={onToggle}
                            className="lg:hidden p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-4 px-3">
                    <ul className="space-y-1">
                        {navItems.map((item, index) => (
                            <li key={item.name}>
                                {item.children ? (
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
                                {/* Dividers matching original sidebar */}
                                {(index === 2 || index === 4 || index === 7 || index === 11) && (
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

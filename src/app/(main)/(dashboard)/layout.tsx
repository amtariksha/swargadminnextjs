'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isLoading, isAuthenticated, isProductionDeliveryOnly } = useAuth();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    // Embed mode — the delivery app's WhatsApp Inbox WebView seeds
    // localStorage['embed_mode']='wa' alongside the auth token so this layout
    // renders WITHOUT the admin sidebar/topbar chrome (the WebView must show
    // ONLY the WhatsApp module, not the whole admin panel).
    const [embedMode, setEmbedMode] = useState(false);
    useEffect(() => {
        try {
            setEmbedMode(localStorage.getItem('embed_mode') === 'wa');
        } catch {
            // Storage unavailable — normal chrome.
        }
    }, []);

    // Restore collapsed state from localStorage
    useEffect(() => {
        const stored = localStorage.getItem('sidebar-collapsed');
        if (stored === 'true') setSidebarCollapsed(true);
    }, []);

    const toggleCollapse = () => {
        const next = !sidebarCollapsed;
        setSidebarCollapsed(next);
        localStorage.setItem('sidebar-collapsed', String(next));
    };

    useEffect(() => {
        if (isLoading) return;
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }
        // Driver-only users have no business in /(dashboard); send them to
        // their dedicated page if they navigate here directly via URL.
        if (isProductionDeliveryOnly) {
            router.push('/production-delivery');
        }
    }, [isLoading, isAuthenticated, isProductionDeliveryOnly, router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 spinner" />
                    <p className="text-slate-400 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    if (embedMode) {
        // Same <main> wrapper as the normal branch (the whatsapp-shell's
        // negative margins cancel this padding) — just no Sidebar/Topbar.
        return (
            <div className="min-h-screen bg-slate-950 flex">
                <div className="flex-1 flex flex-col min-w-0">
                    <main className="flex-1 p-4 lg:p-6 overflow-auto">
                        <div className="animate-fade-in">{children}</div>
                    </main>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex">
            <Sidebar
                isOpen={sidebarOpen}
                onToggle={() => setSidebarOpen(!sidebarOpen)}
                collapsed={sidebarCollapsed}
                onExpandSidebar={() => {
                    setSidebarCollapsed(false);
                    localStorage.setItem('sidebar-collapsed', 'false');
                }}
            />

            <div className="flex-1 flex flex-col min-w-0">
                <Topbar
                    onMenuClick={() => setSidebarOpen(!sidebarOpen)}
                    sidebarCollapsed={sidebarCollapsed}
                    onToggleCollapse={toggleCollapse}
                />

                <main className="flex-1 p-4 lg:p-6 overflow-auto">
                    <div className="animate-fade-in">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

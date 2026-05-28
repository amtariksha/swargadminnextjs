'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut, Truck } from 'lucide-react';
import { BRANDING } from '@/config/tenant';

/**
 * Minimal mobile-first layout for driver-facing pages (currently just
 * /production-delivery). Intentionally has NO sidebar so the limited mobile
 * screen real-estate is available to the data tables.
 *
 * Authenticated drivers and authenticated admins can both reach pages in
 * this group; unauthenticated users are sent to /login.
 */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
    const { isLoading, isAuthenticated, admin, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isLoading, isAuthenticated, router]);

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

    if (!isAuthenticated) return null;

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col">
            <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50">
                <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        <Truck className="w-5 h-5 text-purple-400 flex-shrink-0" />
                        <div className="min-w-0">
                            <h1 className="font-semibold text-sm truncate">{BRANDING.appName}</h1>
                            <p className="text-xs text-slate-400 truncate">{admin?.email || ''}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-300 hover:text-white"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Logout
                    </button>
                </div>
            </header>

            <main className="flex-1 px-4 py-4 lg:px-6">
                <div className="animate-fade-in mx-auto w-full max-w-3xl">
                    {children}
                </div>
            </main>
        </div>
    );
}

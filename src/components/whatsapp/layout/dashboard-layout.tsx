"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Login page renders without sidebar chrome
    if (pathname === "/login") {
        return <>{children}</>;
    }

    return (
        <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 overflow-hidden pb-16 md:pb-0">{children}</main>
            <MobileNav />
        </div>
    );
}

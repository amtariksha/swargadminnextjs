"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, IndianRupee, Megaphone, BarChart3, Menu } from "lucide-react";
import { cn } from "@/lib/whatsapp/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/whatsapp/ui/sheet";
import { Sidebar } from "./sidebar";

const navItems = [
    { href: "/", label: "Inbox", icon: MessageSquare },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/broadcast", label: "Broadcast", icon: Megaphone },
    { href: "/payments", label: "Payments", icon: IndianRupee },
];

export function MobileNav() {
    const pathname = usePathname();

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 pb-safe">
            <nav className="flex items-center justify-around h-16 px-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                {navItems.map((item) => {
                    const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-full gap-1 px-2 transition-colors",
                                isActive ? "text-emerald-600" : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <Icon className={cn("w-5 h-5", isActive && "fill-emerald-100/50")} />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </Link>
                    );
                })}

                {/* More Menu (opens Sidebar in a sheet) */}
                <Sheet>
                    <SheetTrigger asChild>
                        <button className="flex flex-col items-center justify-center w-full h-full gap-1 px-2 text-slate-500 hover:text-slate-900 transition-colors">
                            <Menu className="w-5 h-5" />
                            <span className="text-[10px] font-medium">More</span>
                        </button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-[240px] flex">
                        {/* Render standard Sidebar inside the sheet, forcing it to be open and visible */}
                        <div className="flex-1 w-full h-full md:hidden flex flex-col [&>aside]:flex [&>aside]:w-full [&>aside]:border-none">
                            <Sidebar />
                        </div>
                    </SheetContent>
                </Sheet>
            </nav>
        </div>
    );
}

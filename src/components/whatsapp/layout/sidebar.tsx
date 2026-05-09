"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    MessageSquare,
    Megaphone,
    Users,
    BarChart3,
    ChevronLeft,
    ChevronRight,
    MessageCircle,
    Phone,
    IndianRupee,
    Settings,
    FileText,
    LogOut,
    Wallet,
    Target,
} from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Avatar, AvatarFallback } from "@/components/whatsapp/ui/avatar";
import { Separator } from "@/components/whatsapp/ui/separator";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/whatsapp/ui/tooltip";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/whatsapp/ui/select";
import { cn } from "@/lib/whatsapp/utils";
import { useAppStore } from "@/lib/whatsapp/store";
import { useAuth } from "@/components/whatsapp/auth-provider";
import { useBalance } from "@/lib/whatsapp/hooks";
import { ReminderPopover } from "./reminder-popover";

const navItems = [
    { href: "/", label: "Inbox", icon: MessageSquare },
    { href: "/broadcast", label: "Broadcast", icon: Megaphone },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/payments", label: "Payments", icon: IndianRupee },
    { href: "/ad-campaigns", label: "Ad Campaigns", icon: Target },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const {
        sidebarOpen,
        toggleSidebar,
        numbers,
        activeNumber,
        setActiveNumber,
    } = useAppStore();

    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    const { data: balanceData } = useBalance();

    const allNavItems = [
        ...navItems,
        ...(isAdmin
            ? [
                { href: "/templates", label: "Templates", icon: FileText },
                { href: "/settings", label: "Settings", icon: Settings },
            ]
            : []),
    ];

    return (
        <aside
            className={cn(
                "hidden md:flex flex-col h-screen bg-white border-r border-slate-200 transition-all duration-300 ease-in-out relative z-30",
                sidebarOpen ? "w-[240px]" : "w-[68px]"
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex-shrink-0">
                    <MessageCircle className="w-5 h-5" />
                </div>
                {sidebarOpen && (
                    <span className="font-bold text-lg text-slate-900 tracking-tight">
                        Swarg<span className="text-emerald-600">CRM</span>
                    </span>
                )}
            </div>

            {/* Number Selector */}
            {numbers.length > 0 && (
                <div className="px-3 py-3 border-b border-slate-100">
                    {sidebarOpen ? (
                        <Select
                            value={activeNumber?.number || ""}
                            onValueChange={(val) => {
                                const num = numbers.find((n) => n.number === val);
                                if (num) setActiveNumber(num);
                            }}
                        >
                            <SelectTrigger className="w-full h-9 text-sm bg-slate-50 border-slate-200">
                                <div className="flex items-center gap-2">
                                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                    <SelectValue placeholder="Select number" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                {numbers.map((num) => (
                                    <SelectItem key={num.id} value={num.number}>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{num.label}</span>
                                            <span className="text-xs text-muted-foreground">
                                                +{num.number}
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center justify-center w-10 h-9 rounded-md bg-slate-50 border border-slate-200 cursor-pointer mx-auto">
                                    <Phone className="w-4 h-4 text-emerald-600" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                {activeNumber
                                    ? `${activeNumber.label} (+${activeNumber.number})`
                                    : "No number selected"}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            )}

            {/* Balance Indicator (admin only) */}
            {isAdmin && balanceData?.balance !== null && balanceData?.balance !== undefined && (
                <div className="px-3 py-2 border-b border-slate-100">
                    {sidebarOpen ? (
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-50/60">
                            <Wallet className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            <span className="text-xs font-medium text-emerald-700 truncate">
                                {balanceData.currency === "INR" ? "₹" : balanceData.currency + " "}
                                {Number(balanceData.balance).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </span>
                        </div>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center justify-center w-10 h-8 rounded-md bg-emerald-50/60 cursor-default mx-auto">
                                    <Wallet className="w-4 h-4 text-emerald-600" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                Balance: {balanceData.currency === "INR" ? "₹" : balanceData.currency + " "}
                                {Number(balanceData.balance).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            )}

            {/* Nav */}
            <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
                {allNavItems.map((item) => {
                    const isActive =
                        item.href === "/"
                            ? pathname === "/"
                            : pathname.startsWith(item.href);
                    const Icon = item.icon;

                    const link = (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                                isActive
                                    ? "bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            )}
                        >
                            <Icon
                                className={cn(
                                    "w-5 h-5 flex-shrink-0",
                                    isActive ? "text-emerald-600" : "text-slate-400"
                                )}
                            />
                            {sidebarOpen && <span>{item.label}</span>}
                        </Link>
                    );

                    if (!sidebarOpen) {
                        return (
                            <Tooltip key={item.href}>
                                <TooltipTrigger asChild>{link}</TooltipTrigger>
                                <TooltipContent side="right">{item.label}</TooltipContent>
                            </Tooltip>
                        );
                    }

                    return link;
                })}
            </nav>

            {/* Reminder Popover */}
            <div className={cn("px-3 pb-2", sidebarOpen ? "" : "flex justify-center")}>
                <ReminderPopover />
            </div>

            <Separator />

            {/* User Profile */}
            <div className="p-3">
                <div
                    className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5",
                        sidebarOpen ? "" : "justify-center"
                    )}
                >
                    <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-semibold">
                            {user?.name
                                ?.split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase() || "??"}
                        </AvatarFallback>
                    </Avatar>
                    {sidebarOpen && (
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium text-slate-900 truncate">
                                {user?.name || "User"}
                            </span>
                            <span className="text-xs text-slate-500 capitalize">
                                {user?.role || "agent"}
                            </span>
                        </div>
                    )}
                    {sidebarOpen && (
                        <button
                            onClick={logout}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="Logout"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Toggle Button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="absolute -right-3 top-20 w-6 h-6 rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50 z-40"
            >
                {sidebarOpen ? (
                    <ChevronLeft className="w-3 h-3" />
                ) : (
                    <ChevronRight className="w-3 h-3" />
                )}
            </Button>
        </aside>
    );
}

"use client";

import { useState, useMemo } from "react";
import {
    BarChart3,
    MessageSquare,
    CheckCircle2,
    Eye,
    Coins,
    Search,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    ArrowUpRight,
    ArrowDownLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/whatsapp/ui/card";
import { Input } from "@/components/whatsapp/ui/input";
import { Button } from "@/components/whatsapp/ui/button";
import { Badge } from "@/components/whatsapp/ui/badge";
import { useLogs } from "@/lib/whatsapp/hooks";
import type { WhatsAppLog } from "@/lib/whatsapp/types";

const STATUS_OPTIONS = [
    { value: "all", label: "All Statuses" },
    { value: "sent", label: "Sent" },
    { value: "delivered", label: "Delivered" },
    { value: "read", label: "Read" },
    { value: "failed", label: "Failed" },
];

function getStatusBadge(status: string) {
    const s = status.toLowerCase();
    if (s === "read") return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">Read</Badge>;
    if (s === "delivered") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Delivered</Badge>;
    if (s === "sent") return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 text-[10px]">Sent</Badge>;
    if (s === "failed") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">Failed</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
}

function formatDate(dateStr: string) {
    if (!dateStr) return "\u2014";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString("en-IN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return dateStr;
    }
}

export default function AnalyticsPage() {
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [phone, setPhone] = useState("");
    const [status, setStatus] = useState("all");
    const [page, setPage] = useState(1);
    const limit = 25;

    const { data, isLoading, isRefetching, refetch } = useLogs({
        from: fromDate || undefined,
        to: toDate || undefined,
        phone: phone || undefined,
        status: status !== "all" ? status : undefined,
        page,
        limit,
    });

    const logs = data?.logs || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Compute summary stats from current logs page
    const stats = useMemo(() => {
        const totalMessages = total;
        let delivered = 0;
        let read = 0;
        let totalCredits = 0;

        for (const log of logs) {
            const s = log.status?.toLowerCase();
            if (s === "delivered" || s === "read") delivered++;
            if (s === "read") read++;
            if (log.credits) totalCredits += Number(log.credits);
        }

        const deliveryRate = logs.length > 0 ? Math.round((delivered / logs.length) * 100) : 0;
        const readRate = delivered > 0 ? Math.round((read / delivered) * 100) : 0;

        return { totalMessages, deliveryRate, readRate, totalCredits };
    }, [logs, total]);

    const showingFrom = total === 0 ? 0 : (page - 1) * limit + 1;
    const showingTo = Math.min(page * limit, total);

    return (
        <div className="h-full overflow-auto p-6 bg-slate-50">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Analytics & Logs</h1>
                            <p className="text-sm text-slate-500">
                                WhatsApp message delivery logs from MSG91
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        className="h-9"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <Card className="border-slate-200">
                        <CardContent className="pt-5 pb-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                                        Total Messages
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900">
                                        {stats.totalMessages.toLocaleString()}
                                    </p>
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                    <MessageSquare className="w-5 h-5 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                        <CardContent className="pt-5 pb-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                                        Delivery Rate
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900">
                                        {stats.deliveryRate}%
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">Based on current page</p>
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                        <CardContent className="pt-5 pb-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                                        Read Rate
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900">
                                        {stats.readRate}%
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">Of delivered messages</p>
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                                    <Eye className="w-5 h-5 text-violet-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                        <CardContent className="pt-5 pb-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                                        Credits Used
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900">
                                        {stats.totalCredits > 0 ? stats.totalCredits.toLocaleString() : "\u2014"}
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">On current page</p>
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                                    <Coins className="w-5 h-5 text-orange-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">From</label>
                            <Input
                                type="date"
                                value={fromDate}
                                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                                className="h-9 w-[160px] text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">To</label>
                            <Input
                                type="date"
                                value={toDate}
                                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                                className="h-9 w-[160px] text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Phone</label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                <Input
                                    placeholder="Search phone..."
                                    value={phone}
                                    onChange={(e) => { setPhone(e.target.value); setPage(1); }}
                                    className="h-9 pl-8 w-[180px] text-sm"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</label>
                            <select
                                value={status}
                                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                                className="h-9 px-3 border border-slate-200 rounded-md text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                            >
                                {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        {(fromDate || toDate || phone || status !== "all") && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setFromDate("");
                                    setToDate("");
                                    setPhone("");
                                    setStatus("all");
                                    setPage(1);
                                }}
                                className="h-9 text-xs text-slate-500"
                            >
                                Clear filters
                            </Button>
                        )}
                    </div>
                </div>

                {/* Logs Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <div className="col-span-2">Phone</div>
                        <div className="col-span-1">Dir</div>
                        <div className="col-span-1">Status</div>
                        <div className="col-span-1">Type</div>
                        <div className="col-span-2">Template</div>
                        <div className="col-span-2">Sent At</div>
                        <div className="col-span-1">Delivered</div>
                        <div className="col-span-1">Read</div>
                        <div className="col-span-1">Credits</div>
                    </div>

                    <div className="min-h-[300px]">
                        {isLoading && !logs.length ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                            </div>
                        ) : logs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                <BarChart3 className="w-10 h-10 mb-3 opacity-40" />
                                <p className="text-sm font-medium">No logs found</p>
                                <p className="text-xs mt-1">
                                    {fromDate || toDate || phone || status !== "all"
                                        ? "Try adjusting your filters"
                                        : "Logs will appear once messages are sent through MSG91"}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {logs.map((log: WhatsAppLog) => (
                                    <div
                                        key={log.id}
                                        className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-slate-50/50 transition-colors"
                                    >
                                        <div className="col-span-2 text-sm font-mono text-slate-700 truncate">
                                            +{log.phone}
                                        </div>
                                        <div className="col-span-1">
                                            {log.direction === "inbound" ? (
                                                <ArrowDownLeft className="w-4 h-4 text-blue-500" />
                                            ) : (
                                                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                                            )}
                                        </div>
                                        <div className="col-span-1">
                                            {getStatusBadge(log.status)}
                                        </div>
                                        <div className="col-span-1 text-xs text-slate-500 capitalize">
                                            {log.contentType}
                                        </div>
                                        <div className="col-span-2 text-xs text-slate-600 truncate">
                                            {log.templateName || "\u2014"}
                                        </div>
                                        <div className="col-span-2 text-xs text-slate-500 tabular-nums">
                                            {formatDate(log.sentAt)}
                                        </div>
                                        <div className="col-span-1 text-xs text-slate-500 tabular-nums">
                                            {log.deliveredAt ? formatDate(log.deliveredAt) : "\u2014"}
                                        </div>
                                        <div className="col-span-1 text-xs text-slate-500 tabular-nums">
                                            {log.readAt ? formatDate(log.readAt) : "\u2014"}
                                        </div>
                                        <div className="col-span-1 text-xs text-slate-600 tabular-nums">
                                            {log.credits ?? "\u2014"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {total > 0 && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/30">
                            <p className="text-sm text-slate-500">
                                Showing {showingFrom}&ndash;{showingTo} of {total}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="h-8 px-3 text-xs"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                                    Previous
                                </Button>
                                <span className="text-sm text-slate-600 tabular-nums">
                                    Page {page} of {totalPages || 1}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="h-8 px-3 text-xs"
                                >
                                    Next
                                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

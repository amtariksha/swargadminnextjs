"use client";

import { useState } from "react";
import {
    Megaphone,
    Users,
    Send,
    CheckCircle2,
    Eye,
    XCircle,
    Search,
    ArrowLeft,
    FileText,
    Download,
    MoreVertical,
    Plus,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { Badge } from "@/components/whatsapp/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/whatsapp/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/whatsapp/ui/dropdown-menu";
import { cn } from "@/lib/whatsapp/utils";
import { useBroadcasts, useBroadcast } from "@/lib/whatsapp/hooks";
import { SendBroadcastDialog } from "@/components/whatsapp/broadcast/send-broadcast-dialog";
import type { BroadcastCampaign } from "@/lib/whatsapp/types";
import { useRouter } from "next/navigation";

type ViewMode = "dashboard" | "detail";

function pct(count: number, total: number): string {
    if (total === 0) return "0%";
    return `${((count / total) * 100).toFixed(0)}%`;
}

export default function BroadcastPage() {
    const router = useRouter();
    const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
    const [showSendDialog, setShowSendDialog] = useState(false);

    // Filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [timeFilter, setTimeFilter] = useState("7");

    const { data, isLoading } = useBroadcasts({
        search: search || undefined,
        status: statusFilter,
        days: timeFilter,
    });

    const campaigns = data?.campaigns || [];
    const summary = data?.summary || { totalRecipients: 0, totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 };

    const openDetail = (campaign: BroadcastCampaign) => {
        setSelectedCampaignId(campaign.id);
        setViewMode("detail");
    };

    const handleExportCampaigns = () => {
        const headers = "Name,Template,Status,Recipients,Sent,Delivered,Read,Failed,Created";
        const rows = campaigns.map((c) => [
            `"${c.name}"`,
            `"${c.templateName}"`,
            c.status,
            c.recipientsCount,
            c.sentCount,
            c.deliveredCount,
            c.readCount,
            c.failedCount,
            new Date(c.createdAt).toLocaleDateString("en-IN"),
        ].join(","));
        const csv = [headers, ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `broadcast-campaigns-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (viewMode === "detail" && selectedCampaignId) {
        return (
            <CampaignDetail
                id={selectedCampaignId}
                onBack={() => { setViewMode("dashboard"); setSelectedCampaignId(null); }}
            />
        );
    }

    return (
        <div className="h-full overflow-auto p-6 bg-slate-50">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
                            <Megaphone className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Broadcast Campaigns</h1>
                            <p className="text-sm text-slate-500">Send template messages to multiple recipients</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => router.push("/templates")} className="gap-1.5">
                            <Plus className="w-3.5 h-3.5" />
                            Create Template
                        </Button>
                        <Button size="sm" onClick={() => setShowSendDialog(true)} className="bg-emerald-500 hover:bg-emerald-600 gap-1.5">
                            <Send className="w-3.5 h-3.5" />
                            Send Broadcast
                        </Button>
                    </div>
                </div>

                {/* Overview Cards */}
                <div className="grid grid-cols-5 gap-3 mb-6">
                    <StatCard label="Recipients" value={summary.totalRecipients} icon={Users} color="blue" />
                    <StatCard label="Sent" value={summary.totalSent} pctVal={pct(summary.totalSent, summary.totalRecipients)} icon={Send} color="emerald" />
                    <StatCard label="Delivered" value={summary.totalDelivered} pctVal={pct(summary.totalDelivered, summary.totalRecipients)} icon={CheckCircle2} color="teal" />
                    <StatCard label="Read" value={summary.totalRead} pctVal={pct(summary.totalRead, summary.totalRecipients)} icon={Eye} color="violet" />
                    <StatCard label="Failed" value={summary.totalFailed} pctVal={pct(summary.totalFailed, summary.totalRecipients)} icon={XCircle} color="red" />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search campaigns..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-9 bg-white border-slate-200"
                        />
                    </div>
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                        {["all", "completed", "sending", "failed"].map((s) => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={cn(
                                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize",
                                    statusFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <Select value={timeFilter} onValueChange={setTimeFilter}>
                        <SelectTrigger className="w-[140px] h-9 bg-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7">Past 7 days</SelectItem>
                            <SelectItem value="30">Past 30 days</SelectItem>
                            <SelectItem value="90">Past 90 days</SelectItem>
                            <SelectItem value="all">All time</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={handleExportCampaigns} className="gap-1.5 h-9">
                        <Download className="w-3.5 h-3.5" />
                        Export
                    </Button>
                </div>

                {/* Campaign Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <div className="col-span-3">Campaign</div>
                        <div className="col-span-1">Status</div>
                        <div className="col-span-1 text-right">Recipients</div>
                        <div className="col-span-1 text-right">Sent</div>
                        <div className="col-span-1 text-right">Delivered</div>
                        <div className="col-span-1 text-right">Read</div>
                        <div className="col-span-1 text-right">Failed</div>
                        <div className="col-span-2">Created</div>
                        <div className="col-span-1"></div>
                    </div>

                    <div className="min-h-[300px]">
                        {isLoading && campaigns.length === 0 ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                            </div>
                        ) : campaigns.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                <Megaphone className="w-10 h-10 mb-3" />
                                <p className="text-sm font-medium">No broadcast campaigns yet</p>
                                <p className="text-xs mt-1">Click &ldquo;Send Broadcast&rdquo; to get started</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {campaigns.map((campaign) => (
                                    <div
                                        key={campaign.id}
                                        onClick={() => openDetail(campaign)}
                                        className="grid grid-cols-12 gap-2 px-5 py-3.5 items-center hover:bg-slate-50/50 cursor-pointer transition-colors"
                                    >
                                        <div className="col-span-3">
                                            <p className="text-sm font-medium text-slate-900 truncate">{campaign.name}</p>
                                            <p className="text-xs text-slate-500 truncate">{campaign.templateName.replace(/_/g, " ")}</p>
                                        </div>
                                        <div className="col-span-1">
                                            <StatusBadge status={campaign.status} />
                                        </div>
                                        <div className="col-span-1 text-right text-sm text-slate-700 tabular-nums">{campaign.recipientsCount}</div>
                                        <div className="col-span-1 text-right text-sm text-slate-700 tabular-nums">{campaign.sentCount}</div>
                                        <div className="col-span-1 text-right text-sm text-slate-700 tabular-nums">{campaign.deliveredCount}</div>
                                        <div className="col-span-1 text-right text-sm text-slate-700 tabular-nums">{campaign.readCount}</div>
                                        <div className="col-span-1 text-right text-sm tabular-nums">
                                            {campaign.failedCount > 0 ? (
                                                <span className="text-red-600">{campaign.failedCount}</span>
                                            ) : (
                                                <span className="text-slate-400">0</span>
                                            )}
                                        </div>
                                        <div className="col-span-2 text-xs text-slate-500">
                                            {new Date(campaign.createdAt).toLocaleDateString("en-IN", {
                                                day: "2-digit", month: "short", year: "numeric",
                                            })}
                                            <br />
                                            {new Date(campaign.createdAt).toLocaleTimeString("en-IN", {
                                                hour: "2-digit", minute: "2-digit", hour12: true,
                                            })}
                                        </div>
                                        <div className="col-span-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openDetail(campaign)}>
                                                        <Eye className="w-3.5 h-3.5 mr-2" />View Details
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Send Dialog */}
            {showSendDialog && <SendBroadcastDialog onClose={() => setShowSendDialog(false)} />}
        </div>
    );
}

// ─── Sub Components ──────────────────────────────────────────

function StatCard({ label, value, pctVal, icon: Icon, color }: {
    label: string;
    value: number;
    pctVal?: string;
    icon: React.ElementType;
    color: string;
}) {
    const colors: Record<string, string> = {
        blue: "border-l-blue-500 text-blue-600",
        emerald: "border-l-emerald-500 text-emerald-600",
        teal: "border-l-teal-500 text-teal-600",
        violet: "border-l-violet-500 text-violet-600",
        red: "border-l-red-500 text-red-600",
    };

    return (
        <div className={cn("bg-white rounded-xl border border-slate-200 border-l-4 p-4", colors[color])}>
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">{value.toLocaleString("en-IN")}</span>
                {pctVal && <span className="text-xs text-slate-400">{pctVal}</span>}
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { className: string; label: string }> = {
        completed: { className: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "COMPLETED" },
        sending: { className: "bg-amber-50 text-amber-700 border-amber-200", label: "SENDING" },
        failed: { className: "bg-red-50 text-red-700 border-red-200", label: "FAILED" },
    };
    const c = config[status] || config.completed;
    return <Badge variant="outline" className={cn("text-[10px] h-5 font-semibold", c.className)}>{c.label}</Badge>;
}

function CampaignDetail({ id, onBack }: { id: string; onBack: () => void }) {
    const { data: campaign, isLoading } = useBroadcast(id);

    if (isLoading || !campaign) {
        return (
            <div className="h-full overflow-auto p-6 bg-slate-50">
                <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            </div>
        );
    }

    const total = campaign.recipientsCount;

    const handleDownloadReport = () => {
        const report = [
            `Campaign: ${campaign.name}`,
            `Template: ${campaign.templateName}`,
            `Status: ${campaign.status}`,
            `Created: ${new Date(campaign.createdAt).toLocaleString("en-IN")}`,
            `Number: ${campaign.integratedNumber || "N/A"}`,
            "",
            "Metric,Count,Percentage",
            `Recipients,${total},100%`,
            `Sent,${campaign.sentCount},${pct(campaign.sentCount, total)}`,
            `Delivered,${campaign.deliveredCount},${pct(campaign.deliveredCount, total)}`,
            `Read,${campaign.readCount},${pct(campaign.readCount, total)}`,
            `Replied,${campaign.repliedCount},${pct(campaign.repliedCount, total)}`,
            `Failed,${campaign.failedCount},${pct(campaign.failedCount, total)}`,
        ].join("\n");
        const blob = new Blob([report], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `broadcast-report-${campaign.name.replace(/[^a-zA-Z0-9]/g, "-")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="h-full overflow-auto p-6 bg-slate-50">
            <div className="max-w-4xl mx-auto">
                {/* Back + header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-200 text-slate-600">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-slate-900">{campaign.name}</h1>
                                <StatusBadge status={campaign.status} />
                            </div>
                            <p className="text-sm text-slate-500">
                                {new Date(campaign.createdAt).toLocaleDateString("en-IN", {
                                    day: "2-digit", month: "long", year: "numeric",
                                    hour: "2-digit", minute: "2-digit", hour12: true,
                                })}
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleDownloadReport} className="gap-1.5">
                        <Download className="w-3.5 h-3.5" />
                        Download Report
                    </Button>
                </div>

                {/* Overview */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
                    <h2 className="text-sm font-semibold text-slate-700 mb-3">Overview</h2>
                    <div className="grid grid-cols-3 gap-6 text-sm">
                        <div>
                            <p className="text-xs text-slate-400 mb-1">Message Template</p>
                            <p className="font-medium text-slate-900">{campaign.templateName.replace(/_/g, " ")}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 mb-1">Sending Number</p>
                            <p className="font-medium text-slate-900">+{campaign.integratedNumber || "N/A"}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 mb-1">CSV File</p>
                            <p className="font-medium text-slate-900">{campaign.csvFileName || "N/A"}</p>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Stats</h2>
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <DetailStatCard label="Recipients" value={total} icon={Users} color="blue" />
                    <DetailStatCard label="Sent" value={campaign.sentCount} total={total} icon={Send} color="emerald" />
                    <DetailStatCard label="Delivered" value={campaign.deliveredCount} total={total} icon={CheckCircle2} color="teal" />
                    <DetailStatCard label="Read" value={campaign.readCount} total={total} icon={Eye} color="violet" />
                    <DetailStatCard label="Replied" value={campaign.repliedCount} total={total} icon={FileText} color="indigo" />
                    <DetailStatCard label="Failed" value={campaign.failedCount} total={total} icon={XCircle} color="red" />
                </div>
            </div>
        </div>
    );
}

function DetailStatCard({ label, value, total, icon: Icon, color }: {
    label: string;
    value: number;
    total?: number;
    icon: React.ElementType;
    color: string;
}) {
    const colors: Record<string, string> = {
        blue: "border-l-blue-500 text-blue-600",
        emerald: "border-l-emerald-500 text-emerald-600",
        teal: "border-l-teal-500 text-teal-600",
        violet: "border-l-violet-500 text-violet-600",
        indigo: "border-l-indigo-500 text-indigo-600",
        red: "border-l-red-500 text-red-600",
    };

    return (
        <div className={cn("bg-white rounded-xl border border-slate-200 border-l-4 p-4", colors[color])}>
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">{value.toLocaleString("en-IN")}</span>
                {total !== undefined && total > 0 && (
                    <span className="text-sm text-slate-400">({pct(value, total)})</span>
                )}
            </div>
        </div>
    );
}

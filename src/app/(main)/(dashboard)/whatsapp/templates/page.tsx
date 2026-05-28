"use client";
import { wfetch } from "@/lib/whatsapp/wfetch";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
    Plus,
    FileText,
    RefreshCw,
    Loader2,
    CheckCircle2,
    Clock,
    XCircle,
    Eye,
    Clipboard,
    Building2,
    Search,
} from "lucide-react";
import { useAuth } from "@/components/whatsapp/auth-provider";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/whatsapp/ui/dialog";

interface TemplateComponent {
    type: string;
    text?: string;
    format?: string;
}

interface RemoteTemplate {
    id: string;
    name: string;
    status: string;
    language: string;
    category: string;
    components: TemplateComponent[];
    namespace?: string;
    variables?: string[];
    rejectionReason?: string;
}

/** Render template body with highlighted variables (named + numbered) */
function renderPreviewBody(text: string) {
    const parts = text.split(/(\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}|\{\{\d+\}\})/g);
    return parts.map((part, i) => {
        if (/^\{\{.+\}\}$/.test(part)) {
            return (
                <span
                    key={i}
                    className="bg-emerald-200 text-emerald-800 px-0.5 rounded text-[10px] font-mono"
                >
                    {part}
                </span>
            );
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

function StatusBadge({ status }: { status: string }) {
    const lower = (status || "").toLowerCase();
    const config: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
        draft: { bg: "bg-slate-100 text-slate-600", icon: <Clock className="w-3 h-3" />, label: "Draft" },
        pending: { bg: "bg-amber-50 text-amber-700", icon: <Clock className="w-3 h-3" />, label: "Pending" },
        approved: { bg: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" />, label: "Approved" },
        rejected: { bg: "bg-red-50 text-red-700", icon: <XCircle className="w-3 h-3" />, label: "Rejected" },
        disabled: { bg: "bg-slate-100 text-slate-500", icon: <XCircle className="w-3 h-3" />, label: "Disabled" },
    };
    const { bg, icon, label } = config[lower] || config.draft;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${bg}`}>
            {icon}
            {label}
        </span>
    );
}

function CategoryBadge({ category }: { category: string }) {
    const colors: Record<string, string> = {
        MARKETING: "bg-purple-50 text-purple-700 border-purple-100",
        UTILITY: "bg-blue-50 text-blue-700 border-blue-100",
        AUTHENTICATION: "bg-orange-50 text-orange-700 border-orange-100",
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${colors[category] || "bg-slate-50 text-slate-600 border-slate-100"}`}>
            {category}
        </span>
    );
}

const LANGUAGE_LABELS: Record<string, string> = {
    en: "English",
    hi: "Hindi",
    ta: "Tamil",
    te: "Telugu",
    mr: "Marathi",
};

export default function TemplatesPage() {
    const { user } = useAuth();
    const router = useRouter();
    const isSuperAdmin = user?.role === "super_admin";
    const [templates, setTemplates] = useState<RemoteTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending" | "rejected">("all");

    // Org selector for super_admin
    const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
    const [selectedOrgId, setSelectedOrgId] = useState("");

    // View dialog state
    const [viewTemplate, setViewTemplate] = useState<RemoteTemplate | null>(null);

    // Clipboard toast
    const [copiedName, setCopiedName] = useState<string | null>(null);

    // Fetch orgs for super_admin
    useEffect(() => {
        if (!isSuperAdmin) return;
        wfetch("/api/whatsapp/organizations")
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    setOrgs(data);
                    if (data.length > 0 && !selectedOrgId) setSelectedOrgId(data[0].id);
                }
            })
            .catch(() => {});
    }, [isSuperAdmin]);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const res = await wfetch("/api/whatsapp/templates");
            if (res.ok) {
                const data = await res.json();
                setTemplates(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error("Failed to fetch templates:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            // Also trigger sync to update local templates_local statuses
            await wfetch("/api/whatsapp/templates/sync", { method: "POST" });
            await fetchTemplates();
        } catch (e) {
            console.error("Refresh failed:", e);
        } finally {
            setRefreshing(false);
        }
    };

    // Fetch templates on mount
    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleNewTemplate = () => {
        router.push("/templates/create");
    };

    const handleCopyName = (name: string) => {
        navigator.clipboard.writeText(name);
        setCopiedName(name);
        setTimeout(() => setCopiedName(null), 2000);
    };

    const getBodyText = (t: RemoteTemplate): string => {
        const bodyComp = t.components?.find((c) => c.type === "BODY");
        return bodyComp?.text || "";
    };

    // Filter templates
    const filtered = templates.filter((t) => {
        const matchesSearch = search === "" ||
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            getBodyText(t).toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "all" || t.status?.toLowerCase() === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusCounts = {
        all: templates.length,
        approved: templates.filter((t) => t.status?.toLowerCase() === "approved").length,
        pending: templates.filter((t) => t.status?.toLowerCase() === "pending").length,
        rejected: templates.filter((t) => t.status?.toLowerCase() === "rejected").length,
    };

    if (user?.role !== "admin" && user?.role !== "super_admin") {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <h2 className="text-lg font-semibold text-slate-700">Admin Access Required</h2>
                    <p className="text-sm text-slate-500 mt-1">You need admin permissions to manage templates.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-slate-50 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">WhatsApp Templates</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Templates from your MSG91 / Meta account
                        {templates.length > 0 && (
                            <span className="text-slate-400 ml-1">
                                ({templates.length} template{templates.length !== 1 ? "s" : ""})
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "Refreshing..." : "Refresh"}
                    </Button>
                    <Button
                        onClick={handleNewTemplate}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                        <Plus className="w-4 h-4" />
                        New Template
                    </Button>
                </div>
            </div>

            {/* Org Selector for super_admin */}
            {isSuperAdmin && orgs.length > 0 && (
                <div className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-slate-500" />
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">View templates for organization</label>
                            <select
                                value={selectedOrgId}
                                onChange={(e) => setSelectedOrgId(e.target.value)}
                                className="w-full max-w-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            >
                                {orgs.map((org) => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Search + Status Filter */}
            <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search templates..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-9 bg-white"
                    />
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                    {(["all", "approved", "pending", "rejected"] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                statusFilter === s
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                            <span className="ml-1 text-slate-400">
                                {statusCounts[s]}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Template Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
                    <FileText className="w-10 h-10 mb-3" />
                    <p className="text-sm font-medium">
                        {templates.length === 0 ? "No templates found" : "No templates match your filters"}
                    </p>
                    <p className="text-xs mt-1 mb-4">
                        {templates.length === 0
                            ? "Create a template or click Refresh to fetch from MSG91"
                            : "Try adjusting your search or status filter"
                        }
                    </p>
                    {templates.length === 0 && (
                        <div className="flex gap-2">
                            <Button
                                onClick={handleRefresh}
                                disabled={refreshing}
                                variant="outline"
                                size="sm"
                                className="gap-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                                Refresh
                            </Button>
                            <Button
                                onClick={handleNewTemplate}
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                                size="sm"
                            >
                                <Plus className="w-4 h-4" />
                                Create Template
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((t, idx) => {
                        const bodyText = getBodyText(t);
                        return (
                            <div
                                key={t.id || `${t.name}-${idx}`}
                                onClick={() => setViewTemplate(t)}
                                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all overflow-hidden flex flex-col cursor-pointer"
                            >
                                {/* Card Header */}
                                <div className="flex items-start justify-between p-4 pb-2">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-sm font-semibold text-slate-800 truncate font-mono">
                                            {t.name}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <CategoryBadge category={t.category} />
                                            <StatusBadge status={t.status} />
                                        </div>
                                    </div>
                                </div>

                                {/* Card Body — Preview */}
                                <div className="px-4 pb-3 flex-1">
                                    {bodyText ? (
                                        <p className="text-xs text-slate-600 line-clamp-3 whitespace-pre-wrap leading-relaxed">
                                            {renderPreviewBody(bodyText)}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-slate-400 italic">No body text</p>
                                    )}
                                </div>

                                {/* Card Footer */}
                                <div className="px-4 py-2.5 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                        {LANGUAGE_LABELS[t.language] || t.language}
                                    </span>
                                    {t.variables && t.variables.length > 0 && (
                                        <span className="text-[10px] text-slate-400">
                                            {t.variables.length} variable{t.variables.length !== 1 ? "s" : ""}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* View Template Dialog */}
            <Dialog open={!!viewTemplate} onOpenChange={(open) => { if (!open) setViewTemplate(null); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-base">
                            {viewTemplate?.name}
                        </DialogTitle>
                    </DialogHeader>
                    {viewTemplate && (
                        <div className="space-y-4 mt-2">
                            <div className="flex items-center gap-2">
                                <CategoryBadge category={viewTemplate.category} />
                                <StatusBadge status={viewTemplate.status} />
                                <span className="text-xs text-slate-400">
                                    {LANGUAGE_LABELS[viewTemplate.language] || viewTemplate.language}
                                </span>
                            </div>

                            {/* WhatsApp-style preview */}
                            <div className="rounded-xl bg-[#e5ddd5] p-4">
                                <div className="max-w-[300px]">
                                    <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm">
                                        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                                            {renderPreviewBody(getBodyText(viewTemplate))}
                                        </p>
                                        <div className="flex justify-end mt-1">
                                            <span className="text-[10px] text-slate-400">12:00 PM</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Variables */}
                            {viewTemplate.variables && viewTemplate.variables.length > 0 && (
                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                    <p className="text-xs font-medium text-slate-600 mb-1.5">Variables</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {viewTemplate.variables.map((v) => (
                                            <span
                                                key={v}
                                                className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-mono"
                                            >
                                                {v}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopyName(viewTemplate.name)}
                                    className="gap-1.5 text-xs"
                                >
                                    <Clipboard className="w-3.5 h-3.5" />
                                    {copiedName === viewTemplate.name ? "Copied!" : "Copy Name"}
                                </Button>
                                {viewTemplate.id && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            navigator.clipboard.writeText(viewTemplate.id);
                                            setCopiedName(viewTemplate.id);
                                            setTimeout(() => setCopiedName(null), 2000);
                                        }}
                                        className="gap-1.5 text-xs"
                                    >
                                        <Clipboard className="w-3.5 h-3.5" />
                                        {copiedName === viewTemplate.id ? "Copied!" : "Copy ID"}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

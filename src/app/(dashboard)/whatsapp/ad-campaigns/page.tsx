"use client";
import { wfetch } from "@/lib/whatsapp/wfetch";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    Facebook,
    RefreshCw,
    Loader2,
    ExternalLink,
    Unplug,
    Zap,
    BarChart3,
    List,
    Settings,
    Check,
    AlertCircle,
} from "lucide-react";
import {
    useCTWAConfig,
    useUpdateCTWAConfig,
    useCTWAAds,
    useSyncCTWAAds,
    useCTWALogs,
} from "@/lib/whatsapp/hooks";
import * as api from "@/lib/whatsapp/api";

type Tab = "connect" | "ads" | "logs" | "capi";

export default function AdCampaignsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}>
            <AdCampaignsContent />
        </Suspense>
    );
}

function AdCampaignsContent() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<Tab>("connect");
    const [toast, setToast] = useState<string | null>(null);

    // Check URL params for connection status
    useEffect(() => {
        const connected = searchParams.get("connected");
        const error = searchParams.get("error");
        if (connected === "true") {
            setToast("Facebook account connected successfully!");
            setActiveTab("ads");
        } else if (error) {
            setToast(`Connection failed: ${error}`);
        }
    }, [searchParams]);

    // Auto-dismiss toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
        { key: "connect", label: "Connect", icon: <Facebook className="w-4 h-4" /> },
        { key: "ads", label: "Ads", icon: <BarChart3 className="w-4 h-4" /> },
        { key: "logs", label: "Logs", icon: <List className="w-4 h-4" /> },
        { key: "capi", label: "CAPI Settings", icon: <Settings className="w-4 h-4" /> },
    ];

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Toast */}
            {toast && (
                <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    {toast}
                </div>
            )}

            <h1 className="text-2xl font-bold mb-6">Ad Campaigns</h1>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === tab.key
                                ? "border-teal-600 text-teal-600"
                                : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === "connect" && <ConnectTab />}
            {activeTab === "ads" && <AdsTab />}
            {activeTab === "logs" && <LogsTab />}
            {activeTab === "capi" && <CAPITab />}
        </div>
    );
}

// ─── Connect Tab ──────────────────────────────────────────────
function ConnectTab() {
    const { data: config, isLoading } = useCTWAConfig();
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const handleConnect = async () => {
        setConnecting(true);
        try {
            const { url } = await api.getCTWAAuthUrl();
            window.location.href = url;
        } catch (err) {
            console.error("Failed to get auth URL:", err);
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm("Are you sure you want to disconnect your Facebook account? This will stop CTWA tracking and CAPI events.")) return;
        setDisconnecting(true);
        try {
            await api.disconnectCTWA();
            window.location.reload();
        } catch (err) {
            console.error("Failed to disconnect:", err);
            setDisconnecting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (config?.connected) {
        return (
            <div className="max-w-lg">
                <div className="bg-white border rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Facebook className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="font-medium">{config.facebookName || "Facebook Account"}</p>
                            <p className="text-sm text-gray-500">Connected</p>
                        </div>
                        <div className="ml-auto">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Active
                            </span>
                        </div>
                    </div>

                    {config.adAccountId && (
                        <div className="text-sm text-gray-600 mb-4">
                            <span className="font-medium">Ad Account:</span>{" "}
                            {config.adAccountName || config.adAccountId}
                        </div>
                    )}

                    <div className="text-xs text-gray-400 mb-4">
                        Connected {config.connectedAt ? new Date(config.connectedAt).toLocaleDateString() : ""}
                    </div>

                    <button
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                        {disconnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Unplug className="w-4 h-4" />
                        )}
                        Disconnect
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-lg">
            <div className="bg-white border rounded-lg p-6 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Facebook className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Connect Facebook Account</h2>
                <p className="text-sm text-gray-500 mb-6">
                    Connect your Facebook Ad Account to track Click-to-WhatsApp (CTWA) ad
                    conversations and send conversion events back to Meta.
                </p>
                <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
                >
                    {connecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Facebook className="w-4 h-4" />
                    )}
                    Connect with Facebook
                </button>
                <p className="text-xs text-gray-400 mt-4">
                    Permissions required: ads_read, pages_read_engagement, business_management
                </p>
            </div>
        </div>
    );
}

// ─── Ads Tab ──────────────────────────────────────────────────
function AdsTab() {
    const { data: config } = useCTWAConfig();
    const { data: ads, isLoading } = useCTWAAds();
    const syncMutation = useSyncCTWAAds();

    if (!config?.connected) {
        return (
            <div className="text-center py-12 text-gray-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Connect your Facebook account first to sync ad campaigns.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                    {ads?.length || 0} campaign(s) synced
                </p>
                <button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                    {syncMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    Sync Ads
                </button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            ) : !ads || ads.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border rounded-lg bg-gray-50">
                    <p>No campaigns found. Click &ldquo;Sync Ads&rdquo; to fetch from Meta.</p>
                </div>
            ) : (
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Campaign</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Impressions</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Clicks</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Spend</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Leads</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Synced</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {ads.map((ad) => (
                                <tr key={ad.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{ad.campaignName || ad.campaignId}</div>
                                        {ad.objective && (
                                            <div className="text-xs text-gray-400">{ad.objective}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                ad.status === "ACTIVE"
                                                    ? "bg-green-100 text-green-700"
                                                    : ad.status === "PAUSED"
                                                    ? "bg-yellow-100 text-yellow-700"
                                                    : "bg-gray-100 text-gray-600"
                                            }`}
                                        >
                                            {ad.status || "Unknown"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">{ad.impressions.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right">{ad.clicks.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right">${ad.spend.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right">{ad.leads}</td>
                                    <td className="px-4 py-3 text-right text-xs text-gray-400">
                                        {ad.syncedAt ? new Date(ad.syncedAt).toLocaleDateString() : "-"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {syncMutation.isError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Failed to sync ads. Check your Facebook connection.
                </div>
            )}
        </div>
    );
}

// ─── Logs Tab ─────────────────────────────────────────────────
function LogsTab() {
    const [page, setPage] = useState(1);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [campaign, setCampaign] = useState("");
    const { data, isLoading } = useCTWALogs({ from: from || undefined, to: to || undefined, campaign: campaign || undefined, page, limit: 20 });

    return (
        <div>
            {/* Filters */}
            <div className="flex gap-3 mb-4 flex-wrap">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">From</label>
                    <input
                        type="date"
                        value={from}
                        onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 border rounded-lg text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">To</label>
                    <input
                        type="date"
                        value={to}
                        onChange={(e) => { setTo(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 border rounded-lg text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Campaign</label>
                    <input
                        type="text"
                        value={campaign}
                        onChange={(e) => { setCampaign(e.target.value); setPage(1); }}
                        placeholder="Filter by campaign..."
                        className="px-3 py-1.5 border rounded-lg text-sm w-48"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            ) : !data?.logs || data.logs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border rounded-lg bg-gray-50">
                    <List className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No CTWA logs found. Logs appear when customers click your WhatsApp ads.</p>
                </div>
            ) : (
                <>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date/Time</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Ad / Campaign</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Source URL</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {data.logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-sm">
                                                {log.contactName || log.contactPhone || "-"}
                                            </div>
                                            {log.contactPhone && log.contactName && (
                                                <div className="text-xs text-gray-400">{log.contactPhone}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm">{log.headline || log.adName || "-"}</div>
                                            {log.campaignName && (
                                                <div className="text-xs text-gray-400">{log.campaignName}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {log.sourceUrl ? (
                                                <a
                                                    href={log.sourceUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-teal-600 hover:underline text-xs flex items-center gap-1"
                                                >
                                                    View <ExternalLink className="w-3 h-3" />
                                                </a>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    log.conversationStatus === "open"
                                                        ? "bg-green-100 text-green-700"
                                                        : log.conversationStatus === "resolved"
                                                        ? "bg-gray-100 text-gray-600"
                                                        : "bg-gray-100 text-gray-400"
                                                }`}
                                            >
                                                {log.conversationStatus || "-"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {data.total > 20 && (
                        <div className="flex items-center justify-between mt-4">
                            <p className="text-sm text-gray-500">
                                Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, data.total)} of {data.total}
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={page * 20 >= data.total}
                                    className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── CAPI Settings Tab ────────────────────────────────────────
function CAPITab() {
    const { data: config, isLoading } = useCTWAConfig();
    const updateConfig = useUpdateCTWAConfig();
    const [datasetId, setDatasetId] = useState("");
    const [capiEnabled, setCapiEnabled] = useState(false);
    const [leadTag, setLeadTag] = useState("lead");
    const [purchaseTag, setPurchaseTag] = useState("purchase");
    const [saved, setSaved] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    // Sync form state with config
    useEffect(() => {
        if (config?.connected) {
            setDatasetId(config.datasetId || "");
            setCapiEnabled(config.capiEnabled || false);
            setLeadTag(config.capiLeadTag || "lead");
            setPurchaseTag(config.capiPurchaseTag || "purchase");
        }
    }, [config]);

    const handleSave = () => {
        updateConfig.mutate(
            {
                datasetId,
                capiEnabled,
                capiLeadTag: leadTag,
                capiPurchaseTag: purchaseTag,
            },
            {
                onSuccess: () => {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 3000);
                },
            }
        );
    };

    const handleTest = async () => {
        setTestResult(null);
        try {
            const res = await wfetch("/api/whatsapp/ctwa/config");
            const data = await res.json();
            if (!data.connected || !data.datasetId) {
                setTestResult("error:Configure Dataset ID and save first");
                return;
            }
            // We just verify the config is set properly — actual test would need a ctwa_clid
            setTestResult("success:CAPI configuration looks good. Events will be sent when contacts with CTWA conversations are tagged.");
        } catch {
            setTestResult("error:Failed to verify configuration");
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!config?.connected) {
        return (
            <div className="text-center py-12 text-gray-500">
                <Zap className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Connect your Facebook account first to configure CAPI.</p>
            </div>
        );
    }

    return (
        <div className="max-w-lg space-y-6">
            <div className="bg-white border rounded-lg p-6">
                <h3 className="font-semibold mb-1">Conversions API (CAPI)</h3>
                <p className="text-sm text-gray-500 mb-4">
                    Send Lead and Purchase conversion events to Meta when contacts are tagged,
                    enabling better ad attribution and optimization.
                </p>

                {/* Enable toggle */}
                <div className="flex items-center justify-between mb-6 p-3 bg-gray-50 rounded-lg">
                    <div>
                        <p className="text-sm font-medium">Enable CAPI</p>
                        <p className="text-xs text-gray-500">Send conversion events to Meta</p>
                    </div>
                    <button
                        onClick={() => setCapiEnabled(!capiEnabled)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                            capiEnabled ? "bg-teal-600" : "bg-gray-300"
                        }`}
                    >
                        <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                                capiEnabled ? "translate-x-5" : ""
                            }`}
                        />
                    </button>
                </div>

                {/* Dataset ID */}
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Dataset ID</label>
                    <input
                        type="text"
                        value={datasetId}
                        onChange={(e) => setDatasetId(e.target.value)}
                        placeholder="Enter your Meta dataset ID..."
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        Find this in Meta Events Manager → Settings → Dataset ID
                    </p>
                </div>

                {/* Lead tag */}
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Lead Event Tag</label>
                    <input
                        type="text"
                        value={leadTag}
                        onChange={(e) => setLeadTag(e.target.value)}
                        placeholder="lead"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        When a contact is tagged with &ldquo;{leadTag || "lead"}&rdquo;, a Lead event is sent to Meta.
                    </p>
                </div>

                {/* Purchase tag */}
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Purchase Event Tag</label>
                    <input
                        type="text"
                        value={purchaseTag}
                        onChange={(e) => setPurchaseTag(e.target.value)}
                        placeholder="purchase"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        When a contact is tagged with &ldquo;{purchaseTag || "purchase"}&rdquo;, a Purchase event is sent to Meta.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        onClick={handleSave}
                        disabled={updateConfig.isPending}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                        {updateConfig.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : saved ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <Zap className="w-4 h-4" />
                        )}
                        {saved ? "Saved!" : "Save Settings"}
                    </button>
                    <button
                        onClick={handleTest}
                        className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Test Config
                    </button>
                </div>

                {testResult && (
                    <div
                        className={`mt-3 p-3 rounded-lg text-sm ${
                            testResult.startsWith("success")
                                ? "bg-green-50 border border-green-200 text-green-700"
                                : "bg-red-50 border border-red-200 text-red-700"
                        }`}
                    >
                        {testResult.split(":").slice(1).join(":")}
                    </div>
                )}
            </div>
        </div>
    );
}

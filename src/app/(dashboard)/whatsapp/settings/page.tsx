"use client";
import { wfetch } from "@/lib/whatsapp/wfetch";

import { useState, useEffect } from "react";
import {
    Plus,
    Shield,
    User,
    ToggleLeft,
    ToggleRight,
    Trash2,
    Loader2,
    KeyRound,
    Zap,
    Pencil,
    SlidersHorizontal,
    Check,
    Download,
    Wallet,
    RefreshCw,
    Building2,
    HelpCircle,
} from "lucide-react";
import { useAuth } from "@/components/whatsapp/auth-provider";
import { useSettings, useUpdateSettings, useFetchMsg91Numbers, useBalance } from "@/lib/whatsapp/hooks";
import { MetaEmbeddedSignup } from "@/components/whatsapp/meta-embedded-signup";
import { SetupGuideDialog, type GuideKey } from "@/components/whatsapp/settings/setup-guide-dialog";

interface UserRecord {
    id: string;
    name: string;
    email: string;
    role: string;
    org_id: string;
    is_active: boolean;
    created_at: string;
}

export default function SettingsPage() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddDialog, setShowAddDialog] = useState(false);

    // ─── Form state ────────────────────────────────────────
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [userRole, setUserRole] = useState("agent");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // ─── Settings tab ───────────────────────────────────────
    const [activeTab, setActiveTab] = useState<"users" | "quick-replies" | "numbers" | "general" | "organizations">("users");
    const isSuperAdmin = currentUser?.role === "super_admin";

    // ─── Org list (for super_admin org selectors across tabs) ──
    const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
    const [userSelectedOrgId, setUserSelectedOrgId] = useState("");

    const fetchOrgs = async () => {
        try {
            const res = await wfetch("/api/whatsapp/organizations");
            if (res.ok) {
                const data = await res.json();
                setOrgs(data);
                if (data.length > 0 && !userSelectedOrgId) {
                    setUserSelectedOrgId(data[0].id);
                }
            }
        } catch (e) {
            console.error("Failed to fetch orgs:", e);
        }
    };

    useEffect(() => {
        if (isSuperAdmin) fetchOrgs();
    }, [isSuperAdmin]);

    const getOrgName = (orgId: string) => {
        const org = orgs.find((o) => o.id === orgId);
        return org?.name || "Unknown";
    };

    // ─── Reset password dialog ─────────────────────────────
    const [resetUserId, setResetUserId] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState("");

    const fetchUsers = async () => {
        try {
            const res = await wfetch("/api/whatsapp/users");
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (e) {
            console.error("Failed to fetch users:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);

        try {
            const payload: Record<string, string> = { name, email, password, userRole };
            if (isSuperAdmin && userSelectedOrgId) {
                payload.org_id = userSelectedOrgId;
            }
            const res = await wfetch("/api/whatsapp/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to create user");
                return;
            }

            setShowAddDialog(false);
            setName("");
            setEmail("");
            setPassword("");
            setUserRole("agent");
            fetchUsers();
        } catch {
            setError("Network error");
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (user: UserRecord) => {
        await wfetch(`/api/whatsapp/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: !user.is_active }),
        });
        fetchUsers();
    };

    const toggleRole = async (user: UserRecord) => {
        const newRole = user.role === "admin" ? "agent" : "admin";
        await wfetch(`/api/whatsapp/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: newRole }),
        });
        fetchUsers();
    };

    const deleteUser = async (user: UserRecord) => {
        if (!confirm(`Delete user "${user.name}"? This cannot be undone.`)) return;
        await wfetch(`/api/whatsapp/users/${user.id}`, { method: "DELETE" });
        fetchUsers();
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetUserId || !newPassword) return;

        await wfetch(`/api/whatsapp/users/${resetUserId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: newPassword }),
        });
        setResetUserId(null);
        setNewPassword("");
    };

    if (currentUser?.role !== "admin" && currentUser?.role !== "super_admin") {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <Shield className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <h2 className="text-lg font-semibold text-slate-700">
                        Admin Access Required
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        You need admin permissions to access settings.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-slate-50 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">
                        Settings
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Manage users and quick replies
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
                <button
                    onClick={() => setActiveTab("users")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "users"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                        }`}
                >
                    <User className="w-4 h-4 inline mr-2" />
                    Users
                </button>
                <button
                    onClick={() => setActiveTab("quick-replies")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "quick-replies"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                        }`}
                >
                    <Zap className="w-4 h-4 inline mr-2" />
                    Quick Replies
                </button>
                <button
                    onClick={() => setActiveTab("numbers")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "numbers"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                        }`}
                >
                    <User className="w-4 h-4 inline mr-2" />
                    WhatsApp Numbers
                </button>
                <button
                    onClick={() => setActiveTab("general")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "general"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                        }`}
                >
                    <SlidersHorizontal className="w-4 h-4 inline mr-2" />
                    General
                </button>
                {currentUser?.role === "super_admin" && (
                    <button
                        onClick={() => setActiveTab("organizations")}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "organizations"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                    >
                        <Building2 className="w-4 h-4 inline mr-2" />
                        Organizations
                    </button>
                )}
            </div>

            {activeTab === "users" && (
                <>
                    <div className="flex justify-end mb-4">
                        <button
                            onClick={() => setShowAddDialog(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Add User
                        </button>
                    </div>

                    {/* Users Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60">
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">
                                        Name
                                    </th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">
                                        Email
                                    </th>
                                    {isSuperAdmin && (
                                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">
                                            Org
                                        </th>
                                    )}
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">
                                        Role
                                    </th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">
                                        Status
                                    </th>
                                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={isSuperAdmin ? 6 : 5} className="text-center py-12">
                                            <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                                        </td>
                                    </tr>
                                ) : users.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={isSuperAdmin ? 6 : 5}
                                            className="text-center py-12 text-slate-400"
                                        >
                                            No users found
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((u) => (
                                        <tr
                                            key={u.id}
                                            className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                                        <User className="w-4 h-4 text-emerald-700" />
                                                    </div>
                                                    <span className="font-medium text-slate-800 text-sm">
                                                        {u.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {u.email}
                                            </td>
                                            {isSuperAdmin && (
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                                                        <Building2 className="w-3 h-3" />
                                                        {getOrgName(u.org_id)}
                                                    </span>
                                                </td>
                                            )}
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => toggleRole(u)}
                                                    disabled={u.id === currentUser?.id}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${u.role === "admin"
                                                        ? "bg-purple-100 text-purple-700"
                                                        : "bg-blue-100 text-blue-700"
                                                        } ${u.id === currentUser?.id ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:opacity-80"}`}
                                                >
                                                    <Shield className="w-3 h-3" />
                                                    {u.role}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => toggleActive(u)}
                                                    disabled={u.id === currentUser?.id}
                                                    className={`inline-flex items-center gap-1.5 text-sm ${u.id === currentUser?.id
                                                        ? "opacity-60 cursor-not-allowed"
                                                        : "cursor-pointer"
                                                        }`}
                                                >
                                                    {u.is_active ? (
                                                        <>
                                                            <ToggleRight className="w-5 h-5 text-emerald-600" />
                                                            <span className="text-emerald-700 font-medium text-xs">
                                                                Active
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ToggleLeft className="w-5 h-5 text-slate-400" />
                                                            <span className="text-slate-500 font-medium text-xs">
                                                                Disabled
                                                            </span>
                                                        </>
                                                    )}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => {
                                                            setResetUserId(u.id);
                                                            setNewPassword("");
                                                        }}
                                                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                        title="Reset password"
                                                    >
                                                        <KeyRound className="w-4 h-4" />
                                                    </button>
                                                    {u.id !== currentUser?.id && (
                                                        <button
                                                            onClick={() => deleteUser(u)}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete user"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ─── Add User Dialog ──────────────────────────── */}
                    {showAddDialog && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
                                <h2 className="text-lg font-semibold text-slate-800 mb-4">
                                    Add New User
                                </h2>

                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleAddUser} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Name
                                        </label>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                            placeholder="John Doe"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                            placeholder="john@company.com"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                            placeholder="Minimum 6 characters"
                                            minLength={6}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Role
                                        </label>
                                        <select
                                            value={userRole}
                                            onChange={(e) => setUserRole(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                        >
                                            <option value="agent">Agent</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>

                                    {isSuperAdmin && orgs.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Organization
                                            </label>
                                            <select
                                                value={userSelectedOrgId}
                                                onChange={(e) => setUserSelectedOrgId(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                                required
                                            >
                                                {orgs.map((org) => (
                                                    <option key={org.id} value={org.id}>{org.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowAddDialog(false);
                                                setError("");
                                            }}
                                            className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={saving}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                        >
                                            {saving && (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            )}
                                            {saving ? "Creating…" : "Create User"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ─── Reset Password Dialog ────────────────────── */}
                    {resetUserId && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 mx-4">
                                <h2 className="text-lg font-semibold text-slate-800 mb-4">
                                    Reset Password
                                </h2>
                                <form onSubmit={handleResetPassword} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            New Password
                                        </label>
                                        <input
                                            autoFocus
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                            placeholder="Minimum 6 characters"
                                            minLength={6}
                                            required
                                        />
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setResetUserId(null)}
                                            className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                                        >
                                            Reset Password
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </>
            )}

            {activeTab === "quick-replies" && (
                <QuickRepliesTab isSuperAdmin={!!isSuperAdmin} orgs={orgs} getOrgName={getOrgName} />
            )}

            {activeTab === "numbers" && (
                <NumbersTab />
            )}

            {activeTab === "general" && (
                <GeneralSettingsTab isSuperAdmin={!!isSuperAdmin} orgs={orgs} />
            )}

            {activeTab === "organizations" && (
                <OrganizationsTab />
            )}
        </div>
    );
}

// ─── General Settings Tab ─────────────────────────────────
function GeneralSettingsTab({ isSuperAdmin, orgs }: { isSuperAdmin: boolean; orgs: { id: string; name: string }[] }) {
    const [selectedOrgId, setSelectedOrgId] = useState(orgs[0]?.id || "");
    const { data: settings, isLoading } = useSettings(selectedOrgId || undefined);
    const { mutate: updateSettingsMutation, isPending: saving } = useUpdateSettings();

    const [paymentTemplateName, setPaymentTemplateName] = useState("");
    const [catalogId, setCatalogId] = useState("");
    const [msg91AuthKey, setMsg91AuthKey] = useState("");
    const [razorpayKeyId, setRazorpayKeyId] = useState("");
    const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
    const [contactsPageSize, setContactsPageSize] = useState("25");
    const [paymentsPageSize, setPaymentsPageSize] = useState("20");
    const [facebookAppId, setFacebookAppId] = useState("");
    const [facebookAppSecret, setFacebookAppSecret] = useState("");
    const [facebookOauthRedirectUri, setFacebookOauthRedirectUri] = useState("");
    const [metaApiVersion, setMetaApiVersion] = useState("v21.0");
    const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
    const [webhookCopied, setWebhookCopied] = useState(false);
    const [saved, setSaved] = useState(false);
    const [settingsGuideKey, setSettingsGuideKey] = useState<GuideKey | null>(null);

    // Update selectedOrgId when orgs first load
    useEffect(() => {
        if (orgs.length > 0 && !selectedOrgId) {
            setSelectedOrgId(orgs[0].id);
        }
    }, [orgs, selectedOrgId]);

    useEffect(() => {
        if (settings) {
            setPaymentTemplateName(settings.payment_template_name || "");
            setCatalogId(settings.whatsapp_catalog_id || "");
            setMsg91AuthKey(settings.msg91_auth_key || "");
            setRazorpayKeyId(settings.razorpay_key_id || "");
            setRazorpayKeySecret(settings.razorpay_key_secret || "");
            setContactsPageSize(settings.contacts_page_size || "25");
            setPaymentsPageSize(settings.payments_page_size || "20");
            setFacebookAppId(settings.facebook_app_id || "");
            setFacebookAppSecret(settings.facebook_app_secret || "");
            setFacebookOauthRedirectUri(settings.facebook_oauth_redirect_uri || "");
            setMetaApiVersion(settings.meta_api_version || "v21.0");
            setWebhookVerifyToken(settings.meta_webhook_verify_token || "");
        }
    }, [settings]);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setSaved(false);

        // Org-specific settings
        const orgSettings: Record<string, string> = {
            payment_template_name: paymentTemplateName,
            whatsapp_catalog_id: catalogId,
            msg91_auth_key: msg91AuthKey,
            razorpay_key_id: razorpayKeyId,
            razorpay_key_secret: razorpayKeySecret,
            contacts_page_size: String(Math.min(100, Math.max(5, parseInt(contactsPageSize) || 25))),
            payments_page_size: String(Math.min(100, Math.max(5, parseInt(paymentsPageSize) || 20))),
        };

        // Global settings (only super_admin can save these)
        if (isSuperAdmin) {
            orgSettings.facebook_app_id = facebookAppId;
            orgSettings.facebook_app_secret = facebookAppSecret;
            orgSettings.facebook_oauth_redirect_uri = facebookOauthRedirectUri;
            orgSettings.meta_api_version = metaApiVersion || "v21.0";
            orgSettings.meta_webhook_verify_token = webhookVerifyToken;
        }

        updateSettingsMutation(
            {
                settings: orgSettings,
                orgId: selectedOrgId || undefined,
            },
            {
                onSuccess: () => {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 3000);
                },
            }
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    return (
        <div>
            {/* Org Selector for super_admin */}
            {isSuperAdmin && orgs.length > 0 && (
                <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-slate-500" />
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Configure settings for organization</label>
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

            {/* MSG91 Balance Card */}
            <BalanceCard />

            <form onSubmit={handleSave}>
                <p className="text-sm text-slate-500 mb-6">
                    Organization-specific settings. {isSuperAdmin ? "Select an organization above to configure its settings." : "These values apply to your organization."}
                </p>

                <div className="space-y-6">
                    {/* MSG91 Auth Key */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                        MSG91 Configuration
                        <button type="button" onClick={() => setSettingsGuideKey("msg91_auth_key")} title="MSG91 Auth Key setup guide">
                            <HelpCircle className="w-4 h-4 text-slate-400 hover:text-purple-600 transition-colors" />
                        </button>
                    </h3>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            MSG91 Auth Key
                        </label>
                        <input
                            type="password"
                            value={msg91AuthKey}
                            onChange={(e) => setMsg91AuthKey(e.target.value)}
                            placeholder="Enter org-specific MSG91 auth key"
                            className="w-full max-w-md px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                        />
                        <p className="text-[11px] text-slate-400 mt-1.5">
                            Per-organization MSG91 auth key. If empty, falls back to the global MSG91_AUTH_KEY environment variable.
                        </p>
                    </div>
                </div>

                    {/* Razorpay Settings */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                        Razorpay Payment Gateway
                        <button type="button" onClick={() => setSettingsGuideKey("razorpay")} title="Razorpay setup guide">
                            <HelpCircle className="w-4 h-4 text-slate-400 hover:text-blue-600 transition-colors" />
                        </button>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Razorpay Key ID
                            </label>
                            <input
                                type="text"
                                value={razorpayKeyId}
                                onChange={(e) => setRazorpayKeyId(e.target.value)}
                                placeholder="rzp_live_..."
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Razorpay Key Secret
                            </label>
                            <input
                                type="password"
                                value={razorpayKeySecret}
                                onChange={(e) => setRazorpayKeySecret(e.target.value)}
                                placeholder="••••••••••••••••"
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                        Per-organization Razorpay credentials for creating payment links. If empty, falls back to RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET environment variables.
                    </p>
                </div>

                    {/* WhatsApp Settings */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100">
                        WhatsApp Settings
                    </h3>
                    <div className="space-y-5">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                                Payment Template Name
                                <button type="button" onClick={() => setSettingsGuideKey("payment_template")} title="Payment template setup guide">
                                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-amber-600 transition-colors" />
                                </button>
                            </label>
                            <input
                                type="text"
                                value={paymentTemplateName}
                                onChange={(e) => setPaymentTemplateName(e.target.value)}
                                placeholder="e.g. payment_link_v1"
                                className="w-full max-w-md px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                The MSG91-approved template name for sending payment links when the 24h session window has expired.
                                Template should have variables: {"{{1}}"} = amount, {"{{2}}"} = description, {"{{3}}"} = payment link.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                WhatsApp Catalog ID
                            </label>
                            <input
                                type="text"
                                value={catalogId}
                                onChange={(e) => setCatalogId(e.target.value)}
                                placeholder="e.g. 123456789012345"
                                className="w-full max-w-md px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                Your Facebook/Meta Commerce catalog ID for sending product messages.
                                This will be pre-filled in the product catalog dialog.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Pagination Settings */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100">
                        Pagination
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Contacts Per Page
                            </label>
                            <input
                                type="number"
                                min="5"
                                max="100"
                                value={contactsPageSize}
                                onChange={(e) => setContactsPageSize(e.target.value)}
                                className="w-full max-w-[120px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">5 – 100 items per page</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Payments Per Page
                            </label>
                            <input
                                type="number"
                                min="5"
                                max="100"
                                value={paymentsPageSize}
                                onChange={(e) => setPaymentsPageSize(e.target.value)}
                                className="w-full max-w-[120px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">5 – 100 items per page</p>
                        </div>
                    </div>
                </div>

                {/* Facebook / CTWA Settings — Global, super_admin only */}
                {isSuperAdmin && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100">
                        Facebook / CTWA (Click-to-WhatsApp Ads) <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded ml-2 font-bold uppercase tracking-wider">Global</span>
                    </h3>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Facebook App ID
                            </label>
                            <input
                                type="text"
                                value={facebookAppId}
                                onChange={(e) => setFacebookAppId(e.target.value)}
                                placeholder="e.g. 1234567890123456"
                                className="w-full max-w-md px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                Your Facebook App ID from the Meta Developer Console. This is the same app used for WhatsApp integration.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Facebook App Secret
                            </label>
                            <input
                                type="password"
                                value={facebookAppSecret}
                                onChange={(e) => setFacebookAppSecret(e.target.value)}
                                placeholder="••••••••••••••••"
                                className="w-full max-w-md px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                Your Facebook App Secret. Found under App Settings → Basic in the Meta Developer Console.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                OAuth Redirect URI
                            </label>
                            <input
                                type="url"
                                value={facebookOauthRedirectUri}
                                onChange={(e) => setFacebookOauthRedirectUri(e.target.value)}
                                placeholder="e.g. https://your-domain.com/api/ctwa/callback"
                                className="w-full max-w-md px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                The redirect URL Facebook returns to after OAuth authorization. Must match exactly what&apos;s configured in your Facebook App. For local dev use <code className="text-[11px] bg-slate-100 px-1 rounded">http://localhost:3000/api/ctwa/callback</code>.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Meta API Version
                            </label>
                            <input
                                type="text"
                                value={metaApiVersion}
                                onChange={(e) => setMetaApiVersion(e.target.value)}
                                placeholder="e.g. v21.0"
                                className="w-full max-w-[140px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                The Graph API version to use for Meta API calls (e.g. v21.0). Keep this updated to the latest stable version.
                            </p>
                        </div>
                    </div>
                </div>
                )}

                {/* Webhook Configuration — Global, super_admin only */}
                {isSuperAdmin && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100">
                        Meta Webhook Configuration <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded ml-2 font-bold uppercase tracking-wider">Global</span>
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                        Configure these values in Meta Developer Console &rarr; WhatsApp &rarr; Configuration to receive messages directly from the WhatsApp Business API.
                    </p>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Callback URL
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : "/api/webhooks/meta"}
                                    className="flex-1 max-w-md px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-600 cursor-default"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const url = `${window.location.origin}/api/webhooks/meta`;
                                        navigator.clipboard.writeText(url);
                                        setWebhookCopied(true);
                                        setTimeout(() => setWebhookCopied(false), 2000);
                                    }}
                                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                                >
                                    {webhookCopied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                Set this as the Callback URL in Meta Developer Console &rarr; WhatsApp &rarr; Configuration.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Verify Token
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={webhookVerifyToken}
                                    onChange={(e) => setWebhookVerifyToken(e.target.value)}
                                    placeholder="Enter or generate a verify token"
                                    className="flex-1 max-w-md px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setWebhookVerifyToken(crypto.randomUUID())}
                                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                                >
                                    Generate
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                A secret string used to verify the webhook. Enter the same value in Meta Developer Console when configuring the webhook.
                                Click &ldquo;Generate&rdquo; to create a random token, then save settings and paste it in Meta.
                            </p>
                        </div>
                    </div>
                </div>
                )}
            </div>

            <div className="flex items-center gap-3 mt-6">
                <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                    {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    {saving ? "Saving..." : "Save Settings"}
                </button>
                {saved && (
                    <span className="text-sm text-emerald-600 font-medium animate-in fade-in">
                        Settings saved successfully
                    </span>
                )}
            </div>
        </form>
        <SetupGuideDialog guideKey={settingsGuideKey} onClose={() => setSettingsGuideKey(null)} />
        </div>
    );
}

// ─── Balance Card ─────────────────────────────────────────
function BalanceCard() {
    const { data, isLoading, refetch, isRefetching } = useBalance();

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
                        <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-slate-800">MSG91 Balance</h3>
                        {isLoading ? (
                            <div className="flex items-center gap-2 mt-0.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                                <span className="text-xs text-slate-400">Loading...</span>
                            </div>
                        ) : data?.balance !== null && data?.balance !== undefined ? (
                            <p className="text-xl font-bold text-slate-900 mt-0.5">
                                {data.currency === "INR" ? "₹" : data.currency + " "}
                                {Number(data.balance).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </p>
                        ) : (
                            <p className="text-sm text-slate-400 mt-0.5">Unable to fetch balance</p>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isRefetching}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Refresh balance"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
                </button>
            </div>
        </div>
    );
}

// ─── Quick Replies Tab ────────────────────────────────────
function QuickRepliesTab({ isSuperAdmin, orgs, getOrgName }: { isSuperAdmin: boolean; orgs: { id: string; name: string }[]; getOrgName: (id: string) => string }) {
    const [quickReplies, setQuickReplies] = useState<{ id: string; title: string; body: string; shortcut?: string; orgId?: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [shortcut, setShortcut] = useState("");
    const [selectedOrgId, setSelectedOrgId] = useState(orgs[0]?.id || "");
    const [saving, setSaving] = useState(false);

    const fetchReplies = async () => {
        try {
            const res = await wfetch("/api/whatsapp/quick-replies");
            if (res.ok) setQuickReplies(await res.json());
        } catch (e) {
            console.error("Failed to fetch quick replies:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchReplies(); }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const url = editId ? `/api/quick-replies/${editId}` : "/api/quick-replies";
            const method = editId ? "PATCH" : "POST";
            const payload: Record<string, unknown> = { title, body, shortcut: shortcut || undefined };
            if (isSuperAdmin && selectedOrgId && !editId) {
                payload.orgId = selectedOrgId;
            }
            await wfetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            resetForm();
            fetchReplies();
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (qr: { id: string; title: string; body: string; shortcut?: string; orgId?: string }) => {
        setEditId(qr.id);
        setTitle(qr.title);
        setBody(qr.body);
        setShortcut(qr.shortcut || "");
        if (qr.orgId) setSelectedOrgId(qr.orgId);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this quick reply?")) return;
        await wfetch(`/api/whatsapp/quick-replies/${id}`, { method: "DELETE" });
        fetchReplies();
    };

    const resetForm = () => {
        setShowForm(false);
        setEditId(null);
        setTitle("");
        setBody("");
        setShortcut("");
        if (orgs.length > 0) setSelectedOrgId(orgs[0].id);
    };

    return (
        <div>
            <div className="flex justify-end mb-4">
                <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add Quick Reply
                </button>
            </div>

            {showForm && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
                    <h3 className="text-sm font-semibold text-slate-800 mb-3">
                        {editId ? "Edit Quick Reply" : "New Quick Reply"}
                    </h3>
                    <form onSubmit={handleSave} className="space-y-3">
                        {isSuperAdmin && orgs.length > 0 && !editId && (
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Organization</label>
                                <select
                                    value={selectedOrgId}
                                    onChange={(e) => setSelectedOrgId(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                    required
                                >
                                    {orgs.map((org) => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                    placeholder="e.g., Greeting"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Shortcut (optional)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">/</span>
                                    <input
                                        type="text"
                                        value={shortcut}
                                        onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                                        className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                        placeholder="greeting"
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Body</label>
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none min-h-[80px]"
                                placeholder="Hello! How can I help you today?"
                                required
                            />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {saving ? "Saving..." : editId ? "Update" : "Create"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                ) : quickReplies.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Zap className="w-8 h-8 mb-2" />
                        <p className="text-sm">No quick replies yet</p>
                        <p className="text-xs mt-1">Add your first canned response</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {quickReplies.map((qr) => (
                            <div key={qr.id} className="px-5 py-3 hover:bg-slate-50/50 flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-sm font-medium text-slate-800">{qr.title}</span>
                                        {qr.shortcut && (
                                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">/{qr.shortcut}</span>
                                        )}
                                        {isSuperAdmin && qr.orgId && (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                <Building2 className="w-2.5 h-2.5" />
                                                {getOrgName(qr.orgId)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 line-clamp-2">{qr.body}</p>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                    <button
                                        onClick={() => handleEdit(qr)}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(qr.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Numbers Tab ───────────────────────────────────────────
function NumbersTab() {
    const { user: currentUser } = useAuth();
    const isSuperAdmin = currentUser?.role === "super_admin";
    const [numbers, setNumbers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showMetaSignup, setShowMetaSignup] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [autoDetectResult, setAutoDetectResult] = useState<string | null>(null);

    // Org list for super_admin
    const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

    // Form fields
    const [number, setNumber] = useState("");
    const [label, setLabel] = useState("");
    const [provider, setProvider] = useState<"msg91" | "meta">("msg91");
    const [metaWabaId, setMetaWabaId] = useState("");
    const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
    const [metaAccessToken, setMetaAccessToken] = useState("");
    const [selectedOrgId, setSelectedOrgId] = useState("");
    const [saving, setSaving] = useState(false);
    const [guideKey, setGuideKey] = useState<GuideKey | null>(null);

    const fetchMsg91 = useFetchMsg91Numbers();

    const fetchNumbers = async () => {
        try {
            const res = await wfetch("/api/whatsapp/numbers");
            if (res.ok) setNumbers(await res.json());
        } catch (e) {
            console.error("Failed to fetch numbers:", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchOrgs = async () => {
        try {
            const res = await wfetch("/api/whatsapp/organizations");
            if (res.ok) {
                const data = await res.json();
                setOrgs(data);
                if (data.length > 0 && !selectedOrgId) {
                    setSelectedOrgId(data[0].id);
                }
            }
        } catch (e) {
            console.error("Failed to fetch orgs:", e);
        }
    };

    useEffect(() => { fetchNumbers(); }, []);
    useEffect(() => { if (isSuperAdmin) fetchOrgs(); }, [isSuperAdmin]);

    const getOrgName = (orgId: string) => {
        const org = orgs.find((o) => o.id === orgId);
        return org?.name || "Unknown";
    };

    const resetForm = () => {
        setShowForm(false);
        setEditId(null);
        setNumber("");
        setLabel("");
        setProvider("msg91");
        setMetaWabaId("");
        setMetaPhoneNumberId("");
        setMetaAccessToken("");
        setSelectedOrgId(orgs.length > 0 ? orgs[0].id : "");
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                id: editId || undefined,
                number,
                label,
                provider,
                metaWabaId: provider === "meta" ? metaWabaId : undefined,
                metaPhoneNumberId: provider === "meta" ? metaPhoneNumberId : undefined,
                metaAccessToken: provider === "meta" ? metaAccessToken : undefined,
            };

            // Super admin can assign number to a specific org
            if (isSuperAdmin && selectedOrgId) {
                payload.orgId = selectedOrgId;
            }

            const method = editId ? "PATCH" : "POST";
            const res = await wfetch("/api/whatsapp/numbers", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json();
                alert(`Failed to save: ${err.error || "Unknown error"}`);
                return;
            }

            resetForm();
            fetchNumbers();
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (num: any) => {
        setEditId(num.id);
        setNumber(num.number || "");
        setLabel(num.label || "");
        setProvider(num.provider || "msg91");
        setMetaWabaId(num.metaWabaId || "");
        setMetaPhoneNumberId(num.metaPhoneNumberId || "");
        setMetaAccessToken(num.metaAccessToken || "");
        if (num.orgId) setSelectedOrgId(num.orgId);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Remove this number? This might break sending messages from this number until replaced.")) return;
        try {
            const res = await wfetch(`/api/whatsapp/numbers?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                const err = await res.json();
                alert(`Failed to delete: ${err.error || "Unknown error"}`);
                return;
            }
            fetchNumbers();
        } catch (e) {
            alert("Failed to delete number. Please try again.");
        }
    };

    return (
        <div>
            <div className="flex justify-between mb-4 items-end">
                <p className="text-sm text-slate-500">Configure your integrated WhatsApp numbers and providers.</p>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setAutoDetectResult(null);
                            fetchMsg91.mutate(undefined, {
                                onSuccess: (data) => {
                                    setAutoDetectResult(
                                        `Found ${data.total} number${data.total !== 1 ? "s" : ""}, imported ${data.imported} new`
                                    );
                                    fetchNumbers();
                                    setTimeout(() => setAutoDetectResult(null), 5000);
                                },
                                onError: () => {
                                    setAutoDetectResult("Failed to fetch numbers from MSG91");
                                    setTimeout(() => setAutoDetectResult(null), 5000);
                                },
                            });
                        }}
                        disabled={fetchMsg91.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg font-medium text-sm hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                        {fetchMsg91.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                        Auto-detect from MSG91
                    </button>
                    <button
                        onClick={() => { setShowMetaSignup(true); setShowForm(false); }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        <Zap className="w-4 h-4" />
                        Connect via Meta
                    </button>
                    <button
                        onClick={() => { resetForm(); setShowForm(true); setShowMetaSignup(false); }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Number
                    </button>
                </div>
            </div>

            {autoDetectResult && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
                    autoDetectResult.includes("Failed")
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                }`}>
                    {autoDetectResult}
                </div>
            )}

            {showMetaSignup && (
                <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 mb-6">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-800">
                            Connect WhatsApp via Meta Embedded Signup
                        </h3>
                        <button onClick={() => setShowMetaSignup(false)} className="text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
                    </div>
                    <MetaEmbeddedSignup
                        onSuccess={() => {
                            fetchNumbers();
                            setTimeout(() => setShowMetaSignup(false), 2000);
                        }}
                    />
                </div>
            )}

            {showForm && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100">
                        {editId ? "Edit Number Configuration" : "Add Number Configuration"}
                    </h3>
                    <form onSubmit={handleSave} className="space-y-4">
                        {isSuperAdmin && orgs.length > 0 && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Organization</label>
                                <select
                                    value={selectedOrgId}
                                    onChange={(e) => setSelectedOrgId(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    required
                                >
                                    {orgs.map((org) => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1">Assign this number to an organization</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                                <input
                                    type="text"
                                    value={number}
                                    onChange={(e) => setNumber(e.target.value)}
                                    placeholder="e.g. 919876543210 (include country code)"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    required
                                    disabled={!!editId}
                                />
                                {editId && <p className="text-[10px] text-slate-400 mt-1">Number cannot be edited after creation. Create a new one instead.</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Label</label>
                                <input
                                    type="text"
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="e.g. Sales Support"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-2">Provider</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="provider"
                                        value="msg91"
                                        checked={provider === "msg91"}
                                        onChange={(e) => setProvider(e.target.value as any)}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm text-slate-700 font-medium">MSG91 API</span>
                                    <button type="button" onClick={(e) => { e.preventDefault(); setGuideKey("msg91"); }} title="MSG91 setup guide">
                                        <HelpCircle className="w-4 h-4 text-slate-400 hover:text-purple-600 transition-colors" />
                                    </button>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="provider"
                                        value="meta"
                                        checked={provider === "meta"}
                                        onChange={(e) => setProvider(e.target.value as any)}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm text-slate-700 font-medium">Direct Meta Cloud API</span>
                                    <button type="button" onClick={(e) => { e.preventDefault(); setGuideKey("meta"); }} title="Meta setup guide">
                                        <HelpCircle className="w-4 h-4 text-slate-400 hover:text-blue-600 transition-colors" />
                                    </button>
                                </label>
                            </div>
                            <SetupGuideDialog guideKey={guideKey} onClose={() => setGuideKey(null)} />
                        </div>

                        {provider === "meta" && (
                            <div className="bg-blue-50/50 rounded-lg p-4 border border-blue-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <p className="text-xs font-medium text-blue-800">Meta WhatsApp Business API Settings</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp Business Account ID (WABA ID)</label>
                                        <input
                                            type="text"
                                            value={metaWabaId}
                                            onChange={(e) => setMetaWabaId(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                            required={provider === "meta"}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number ID</label>
                                        <input
                                            type="text"
                                            value={metaPhoneNumberId}
                                            onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                            required={provider === "meta"}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-slate-600 mb-1">System User Access Token</label>
                                        <input
                                            type="password"
                                            value={metaAccessToken}
                                            onChange={(e) => setMetaAccessToken(e.target.value)}
                                            placeholder="EAAI..."
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-mono"
                                            required={provider === "meta"}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {saving ? "Saving..." : editId ? "Update Configuration" : "Save Number"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    <div className="col-span-full flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                ) : numbers.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm border-dashed">
                        <User className="w-8 h-8 mb-3 text-slate-300" />
                        <p className="text-sm font-medium text-slate-600">No numbers configured</p>
                        <p className="text-xs mt-1 max-w-sm text-center">Add a phone number to start sending and receiving messages.</p>
                    </div>
                ) : (
                    numbers.map((num) => (
                        <div key={num.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="font-semibold text-slate-800 text-base flex items-center gap-2">
                                        +{num.number}
                                        {num.isDefault && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Default</span>}
                                    </h4>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">{num.label}</p>
                                    {isSuperAdmin && num.orgId && (
                                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                            <Building2 className="w-3 h-3" />
                                            {getOrgName(num.orgId)}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                     <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider ${num.provider === 'meta' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                        {num.provider || 'MSG91'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-2">
                                    <>
                                        <button
                                            onClick={() => handleEdit(num)}
                                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                            title="Edit Configuration"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(num.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Delete Number"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ─── Organizations Tab (super_admin only) ────────────────────
interface OrgRecord {
    id: string;
    name: string;
    slug: string;
    created_at: string;
    updated_at: string;
}

function OrganizationsTab() {
    const [orgs, setOrgs] = useState<OrgRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [orgName, setOrgName] = useState("");
    const [orgSlug, setOrgSlug] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editSlug, setEditSlug] = useState("");

    const fetchOrgs = async () => {
        try {
            const res = await wfetch("/api/whatsapp/organizations");
            if (res.ok) setOrgs(await res.json());
        } catch (e) {
            console.error("Failed to fetch organizations:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrgs(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);
        try {
            const res = await wfetch("/api/whatsapp/organizations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: orgName, slug: orgSlug }),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to create organization");
                return;
            }
            setShowAdd(false);
            setOrgName("");
            setOrgSlug("");
            fetchOrgs();
        } catch {
            setError("Network error");
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (id: string) => {
        setError("");
        setSaving(true);
        try {
            const res = await wfetch(`/api/whatsapp/organizations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: editName, slug: editSlug }),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to update organization");
                return;
            }
            setEditId(null);
            fetchOrgs();
        } catch {
            setError("Network error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this organization? All associated data may become orphaned.")) return;
        try {
            const res = await wfetch(`/api/whatsapp/organizations/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || "Failed to delete");
                return;
            }
            fetchOrgs();
        } catch {
            alert("Network error");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-slate-500">{orgs.length} organization(s)</p>
                <button
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
                >
                    <Plus className="w-4 h-4" />
                    New Organization
                </button>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
            )}

            {showAdd && (
                <form onSubmit={handleCreate} className="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                        <input
                            type="text"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            placeholder="Acme Corp"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Slug</label>
                        <input
                            type="text"
                            value={orgSlug}
                            onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                            placeholder="acme-corp"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                            required
                        />
                        <p className="text-xs text-slate-400 mt-1">Lowercase letters, numbers, and hyphens only</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">
                            {saving ? "Creating..." : "Create"}
                        </button>
                        <button type="button" onClick={() => { setShowAdd(false); setError(""); }} className="px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            <div className="space-y-2">
                {orgs.map((org) => (
                    <div key={org.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white">
                        {editId === org.id ? (
                            <div className="flex-1 flex items-center gap-3">
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="px-2 py-1 border border-slate-300 rounded text-sm"
                                />
                                <input
                                    type="text"
                                    value={editSlug}
                                    onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                    className="px-2 py-1 border border-slate-300 rounded text-sm"
                                />
                                <button onClick={() => handleUpdate(org.id)} disabled={saving} className="px-3 py-1 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 disabled:opacity-50">
                                    Save
                                </button>
                                <button onClick={() => setEditId(null)} className="px-3 py-1 text-slate-600 bg-slate-100 rounded text-sm hover:bg-slate-200">
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <p className="font-medium text-slate-900">{org.name}</p>
                                    <p className="text-xs text-slate-400">slug: {org.slug} &middot; {new Date(org.created_at).toLocaleDateString()}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => { setEditId(org.id); setEditName(org.name); setEditSlug(org.slug); }}
                                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                        title="Edit"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    {org.id !== "00000000-0000-0000-0000-000000000001" && (
                                        <button
                                            onClick={() => handleDelete(org.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

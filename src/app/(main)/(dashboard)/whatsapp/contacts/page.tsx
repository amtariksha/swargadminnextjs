"use client";
import { wfetch } from "@/lib/whatsapp/wfetch";

import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Search, Mail, Phone, Tag, ChevronLeft, ChevronRight, Upload, Download, FileDown, Plus, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/whatsapp/ui/input";
import { Badge } from "@/components/whatsapp/ui/badge";
import { Button } from "@/components/whatsapp/ui/button";
import { Avatar, AvatarFallback } from "@/components/whatsapp/ui/avatar";
import { cn } from "@/lib/whatsapp/utils";
import { useContacts, useSettings } from "@/lib/whatsapp/hooks";
import Papa from "papaparse";

// ─── CSV Template ────────────────────────────────────────
const CSV_TEMPLATE = `phone,name,email,tags
919876543210,John Doe,john@example.com,"vip,premium"
918765432109,Jane Smith,jane@example.com,regular
917654321098,Bob Wilson,,new`;

function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts_template.csv";
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Import Dialog ───────────────────────────────────────
interface ParsedContact {
    phone: string;
    name?: string;
    email?: string;
    tags?: string;
}

interface ImportResult {
    imported: number;
    skipped: number;
    errors: { row: number; phone: string; message: string }[];
    total: number;
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [contacts, setContacts] = useState<ParsedContact[]>([]);
    const [parseError, setParseError] = useState("");
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParseError("");
        setResult(null);

        Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    setParseError(`CSV parse error: ${results.errors[0].message}`);
                    return;
                }
                const rows = results.data
                    .map((row) => ({
                        phone: (row.phone || row.Phone || row.PHONE || row.mobile || row.Mobile || "").toString().trim(),
                        name: (row.name || row.Name || row.NAME || "").toString().trim(),
                        email: (row.email || row.Email || row.EMAIL || "").toString().trim(),
                        tags: (row.tags || row.Tags || row.TAGS || "").toString().trim(),
                    }))
                    .filter((r) => r.phone.length > 0);

                if (rows.length === 0) {
                    setParseError("No valid contacts found. Make sure the CSV has a 'phone' column.");
                    return;
                }
                setContacts(rows);
            },
            error: (err) => setParseError(err.message),
        });
    };

    const handleImport = async () => {
        setImporting(true);
        try {
            const res = await wfetch("/api/whatsapp/contacts/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contacts }),
            });
            const data = await res.json();
            if (!res.ok) {
                setParseError(data.error || "Import failed");
            } else {
                setResult(data);
                onDone();
            }
        } catch {
            setParseError("Network error during import");
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="text-base font-semibold text-slate-900">Import Contacts</h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {/* Template download */}
                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <div>
                            <p className="text-sm font-medium text-blue-900">CSV Template</p>
                            <p className="text-xs text-blue-700">Download the template, fill in your contacts, and upload</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-100">
                            <Download className="w-3.5 h-3.5" />
                            Download
                        </Button>
                    </div>

                    {/* File input */}
                    <div>
                        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
                        <Button
                            variant="outline"
                            onClick={() => fileRef.current?.click()}
                            className="w-full h-20 border-dashed border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-slate-500 gap-2"
                        >
                            <Upload className="w-5 h-5" />
                            {contacts.length > 0 ? `${contacts.length} contacts loaded` : "Click to upload CSV file"}
                        </Button>
                    </div>

                    {/* Parse error */}
                    {parseError && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            {parseError}
                        </div>
                    )}

                    {/* Preview */}
                    {contacts.length > 0 && !result && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Preview ({contacts.length} contacts)
                            </div>
                            <div className="max-h-40 overflow-auto divide-y divide-slate-50">
                                {contacts.slice(0, 5).map((c, i) => (
                                    <div key={i} className="px-3 py-2 text-xs text-slate-700 flex gap-4">
                                        <span className="font-medium w-28 truncate">{c.phone}</span>
                                        <span className="w-28 truncate">{c.name || "—"}</span>
                                        <span className="truncate text-slate-500">{c.email || "—"}</span>
                                    </div>
                                ))}
                                {contacts.length > 5 && (
                                    <div className="px-3 py-2 text-xs text-slate-400 text-center">
                                        ... and {contacts.length - 5} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {result && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-700">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span>
                                    <strong>{result.imported}</strong> imported, <strong>{result.skipped}</strong> skipped
                                    {result.errors.length > 0 && `, ${result.errors.length} errors`}
                                </span>
                            </div>
                            {result.errors.length > 0 && (
                                <div className="border border-red-100 rounded-lg overflow-hidden">
                                    <div className="px-3 py-1.5 bg-red-50 text-xs font-semibold text-red-600">
                                        Errors ({result.errors.length})
                                    </div>
                                    <div className="max-h-24 overflow-auto divide-y divide-red-50 text-xs text-red-600">
                                        {result.errors.slice(0, 10).map((e, i) => (
                                            <div key={i} className="px-3 py-1.5">
                                                Row {e.row} ({e.phone}): {e.message}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        {result ? "Close" : "Cancel"}
                    </Button>
                    {!result && (
                        <Button
                            size="sm"
                            onClick={handleImport}
                            disabled={contacts.length === 0 || importing}
                            className="gap-1.5"
                        >
                            {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {importing ? "Importing..." : `Import ${contacts.length} Contacts`}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Add Contact Dialog ─────────────────────────────────
function AddContactDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [tags, setTags] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const handleSave = async () => {
        if (!phone.trim()) {
            setError("Phone number is required");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const res = await wfetch("/api/whatsapp/contacts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim() || phone.trim(),
                    phone: phone.trim().replace(/^\+/, ""),
                    email: email.trim() || undefined,
                    tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to create contact");
            } else {
                onDone();
                onClose();
            }
        } catch {
            setError("Network error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="text-base font-semibold text-slate-900">Add Contact</h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Phone Number *</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="919876543210"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="pl-9"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Name</label>
                        <Input
                            placeholder="John Doe"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="john@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="pl-9"
                                type="email"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Tags</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="vip, premium (comma separated)"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {saving ? "Saving..." : "Add Contact"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function ContactsPage() {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [showImport, setShowImport] = useState(false);
    const [showAddContact, setShowAddContact] = useState(false);
    const [exporting, setExporting] = useState(false);
    const { data: settings } = useSettings();
    const pageSize = parseInt(settings?.contacts_page_size || "25") || 25;
    const { data, isLoading, refetch } = useContacts(search, page, pageSize);

    const contacts = data?.contacts || [];
    const total = data?.total || 0;
    const limit = data?.limit || 25;
    const totalPages = Math.ceil(total / limit);

    // Reset to page 1 when search changes
    useEffect(() => {
        setPage(1);
    }, [search]);

    const showingFrom = total === 0 ? 0 : (page - 1) * limit + 1;
    const showingTo = Math.min(page * limit, total);

    const handleExport = useCallback(async () => {
        setExporting(true);
        try {
            const res = await wfetch(`/api/whatsapp/contacts/export${search ? `?search=${encodeURIComponent(search)}` : ""}`);
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            // silently fail — user sees the button stop spinning
        } finally {
            setExporting(false);
        }
    }, [search]);

    return (
        <div className="h-full overflow-auto p-6 bg-slate-50">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Contacts</h1>
                            <p className="text-sm text-slate-500">
                                {total} contact{total !== 1 ? "s" : ""}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                            disabled={exporting || total === 0}
                            className="gap-1.5"
                        >
                            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                            Export CSV
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowImport(true)}
                            className="gap-1.5"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            Import
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setShowAddContact(true)}
                            className="gap-1.5"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add Contact
                        </Button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search by name, phone, or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-10 bg-white border-slate-200"
                    />
                </div>

                {/* Import Dialog */}
                {showImport && (
                    <ImportDialog
                        onClose={() => setShowImport(false)}
                        onDone={() => refetch()}
                    />
                )}

                {/* Add Contact Dialog */}
                {showAddContact && (
                    <AddContactDialog
                        onClose={() => setShowAddContact(false)}
                        onDone={() => refetch()}
                    />
                )}

                {/* Contact List */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <div className="col-span-4">Contact</div>
                        <div className="col-span-3">Phone</div>
                        <div className="col-span-3">Email</div>
                        <div className="col-span-2">Tags</div>
                    </div>

                    <div className="min-h-[400px]">
                        {isLoading && !contacts.length ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                            </div>
                        ) : contacts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <Users className="w-8 h-8 mb-2" />
                                <p className="text-sm">No contacts found</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {contacts.map((contact) => {
                                    const initials = contact.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .toUpperCase()
                                        .slice(0, 2);
                                    const colors = [
                                        "from-blue-500 to-indigo-600",
                                        "from-emerald-500 to-teal-600",
                                        "from-orange-500 to-red-500",
                                        "from-violet-500 to-purple-600",
                                        "from-pink-500 to-rose-600",
                                    ];
                                    const colorIndex =
                                        contact.name.charCodeAt(0) % colors.length;

                                    return (
                                        <div
                                            key={contact.id}
                                            className="grid grid-cols-12 gap-4 px-5 py-3.5 items-center hover:bg-slate-50/50 transition-colors"
                                        >
                                            <div className="col-span-4 flex items-center gap-3">
                                                <Avatar className="w-8 h-8">
                                                    <AvatarFallback
                                                        className={cn(
                                                            "bg-gradient-to-br text-white text-xs font-semibold",
                                                            colors[colorIndex]
                                                        )}
                                                    >
                                                        {initials}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="text-sm font-medium text-slate-900 truncate">
                                                    {contact.name}
                                                </span>
                                            </div>
                                            <div className="col-span-3 flex items-center gap-1.5 text-sm text-slate-600">
                                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                                +{contact.phone}
                                            </div>
                                            <div className="col-span-3 flex items-center gap-1.5 text-sm text-slate-600 truncate">
                                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                                {contact.email || "\u2014"}
                                            </div>
                                            <div className="col-span-2 flex flex-wrap gap-1">
                                                {contact.tags.map((tag) => (
                                                    <Badge
                                                        key={tag}
                                                        variant="secondary"
                                                        className="text-[10px] h-5 bg-slate-100"
                                                    >
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {total > 0 && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/30">
                            <p className="text-sm text-slate-500">
                                Showing {showingFrom}\u2013{showingTo} of {total}
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
                                    Page {page} of {totalPages}
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

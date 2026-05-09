"use client";
import { wfetch } from "@/lib/whatsapp/wfetch";

import { useState, useEffect, useMemo, useCallback, useRef, Fragment, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    Send,
    Save,
    ChevronDown,
    Plus,
    Trash2,
    GripVertical,
    Bold,
    Italic,
    Strikethrough,
    Upload,
    Image as ImageIcon,
    Video,
    FileText,
    MapPin,
    Type,
    X,
    Phone,
    ExternalLink,
    Copy,
    Link2,
} from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { Label } from "@/components/whatsapp/ui/label";
import { Textarea } from "@/components/whatsapp/ui/textarea";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/whatsapp/ui/dropdown-menu";
import { useNumbers } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { TemplateButton } from "@/lib/whatsapp/types";

// ─── Constants ──────────────────────────────────────────────
const CATEGORIES = [
    { value: "MARKETING", label: "Marketing" },
    { value: "UTILITY", label: "Utility" },
    { value: "AUTHENTICATION", label: "Authentication" },
];

const LANGUAGES = [
    { value: "en", label: "English" },
    { value: "hi", label: "Hindi" },
    { value: "ta", label: "Tamil" },
    { value: "te", label: "Telugu" },
    { value: "mr", label: "Marathi" },
];

const HEADER_TYPES = [
    { value: "NONE", label: "None", icon: X },
    { value: "TEXT", label: "Text", icon: Type },
    { value: "IMAGE", label: "Image", icon: ImageIcon },
    { value: "VIDEO", label: "Video", icon: Video },
    { value: "DOCUMENT", label: "Document", icon: FileText },
    { value: "LOCATION", label: "Location", icon: MapPin },
];

const CONTACT_VARIABLES = [
    { name: "name", label: "Name" },
    { name: "email", label: "Email" },
    { name: "phone", label: "Phone" },
];

// ─── Helper: Char Counter ────────────────────────────────────
function CharCounter({ current, max }: { current: number; max: number }) {
    return (
        <span className={`text-[11px] tabular-nums ${current > max ? "text-red-500 font-semibold" : "text-slate-400"}`}>
            {current}/{max}
        </span>
    );
}

// ─── Helper: Render preview body with highlighted variables ──
function renderPreviewBody(text: string) {
    const parts = text.split(/(\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}|\{\{\d+\}\})/g);
    return parts.map((part, i) => {
        if (/^\{\{.+\}\}$/.test(part)) {
            return (
                <span
                    key={i}
                    className="bg-emerald-100 text-emerald-800 px-1 rounded text-xs font-mono"
                >
                    {part}
                </span>
            );
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

// ─── Main Page Component ──────────────────────────────────────
export default function CreateTemplatePage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-6 h-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /></div>}>
            <CreateTemplateContent />
        </Suspense>
    );
}

function CreateTemplateContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("edit");

    const { data: numbersData } = useNumbers();
    const numbers = numbersData || [];
    const activeNumber = useAppStore((s) => s.activeNumber);

    // Form state
    const [name, setName] = useState("");
    const [category, setCategory] = useState("MARKETING");
    const [language, setLanguage] = useState("en");
    const [channel, setChannel] = useState("");
    const [headerType, setHeaderType] = useState("NONE");
    const [headerContent, setHeaderContent] = useState("");
    const [body, setBody] = useState("");
    const [footer, setFooter] = useState("");
    const [buttons, setButtons] = useState<TemplateButton[]>([]);
    const [variableSamples, setVariableSamples] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [loaded, setLoaded] = useState(!editId);

    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Set default channel
    useEffect(() => {
        if (!channel && activeNumber) {
            setChannel(activeNumber.number);
        } else if (!channel && numbers.length > 0) {
            setChannel(numbers[0].number);
        }
    }, [activeNumber, numbers, channel]);

    // Load template data if editing
    useEffect(() => {
        if (!editId) return;
        (async () => {
            try {
                const res = await wfetch("/api/whatsapp/templates/local");
                if (!res.ok) return;
                const templates = await res.json();
                const t = templates.find((tpl: Record<string, unknown>) => tpl.id === editId);
                if (t) {
                    setName(t.name || "");
                    setCategory(t.category || "MARKETING");
                    setLanguage(t.language || "en");
                    setHeaderType(t.headerType || "NONE");
                    setHeaderContent(t.headerContent || "");
                    setBody(t.body || "");
                    setFooter(t.footer || "");
                    setButtons(t.buttons || []);
                    setVariableSamples(t.variableSamples || {});
                }
            } catch (e) {
                console.error("Failed to load template:", e);
            } finally {
                setLoaded(true);
            }
        })();
    }, [editId]);

    // Extract variables from body
    const detectedVars = useMemo(() => {
        const regex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
        const vars: string[] = [];
        let match;
        while ((match = regex.exec(body)) !== null) {
            if (!vars.includes(match[1])) {
                vars.push(match[1]);
            }
        }
        return vars;
    }, [body]);

    // Insert variable at cursor position
    const insertVariable = useCallback((varName: string) => {
        const textarea = bodyRef.current;
        if (!textarea) {
            setBody((prev) => prev + `{{${varName}}}`);
            return;
        }
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = `{{${varName}}}`;
        const newBody = body.slice(0, start) + text + body.slice(end);
        setBody(newBody);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        });
    }, [body]);

    // Insert formatting around selection
    const insertFormatting = useCallback((marker: string) => {
        const textarea = bodyRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = body.slice(start, end);
        const newBody = body.slice(0, start) + marker + selectedText + marker + body.slice(end);
        setBody(newBody);
        requestAnimationFrame(() => {
            textarea.focus();
            if (selectedText) {
                textarea.setSelectionRange(start, end + marker.length * 2);
            } else {
                textarea.setSelectionRange(start + marker.length, start + marker.length);
            }
        });
    }, [body]);

    // Handle file upload
    const handleFileUpload = async (file: File) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", headerType.toLowerCase());
            const res = await wfetch("/api/whatsapp/upload", { method: "POST", body: formData });
            if (!res.ok) {
                const err = await res.json();
                alert(`Upload failed: ${err.error}`);
                return;
            }
            const data = await res.json();
            setHeaderContent(data.url);
        } catch (e) {
            console.error("Upload error:", e);
            alert("Failed to upload file");
        } finally {
            setUploading(false);
        }
    };

    // Button management
    const addButton = (type: TemplateButton["type"]) => {
        if (buttons.length >= 10) return;
        const newBtn: TemplateButton = { type, text: "" };
        if (type === "URL") { newBtn.url = ""; newBtn.url_type = "static"; }
        if (type === "PHONE_NUMBER") { newBtn.phone_number = "+91"; }
        if (type === "COPY_CODE") { newBtn.text = "Copy code"; newBtn.example = ""; }
        setButtons([...buttons, newBtn]);
    };

    const updateButton = (index: number, updates: Partial<TemplateButton>) => {
        setButtons(buttons.map((b, i) => (i === index ? { ...b, ...updates } : b)));
    };

    const removeButton = (index: number) => {
        setButtons(buttons.filter((_, i) => i !== index));
    };

    const urlCount = buttons.filter((b) => b.type === "URL").length;
    const phoneCount = buttons.filter((b) => b.type === "PHONE_NUMBER").length;
    const couponCount = buttons.filter((b) => b.type === "COPY_CODE").length;

    // Save draft
    const handleSave = async () => {
        if (!name.trim() || !body.trim()) { alert("Template name and body are required."); return; }
        setSaving(true);
        try {
            const payload = {
                name: name.trim(), category, language,
                headerType: headerType !== "NONE" ? headerType : null,
                headerContent: headerType !== "NONE" ? headerContent : null,
                body: body.trim(),
                footer: footer.trim() || null,
                buttons: buttons.length > 0 ? buttons : null,
                variableSamples: Object.keys(variableSamples).length > 0 ? variableSamples : null,
            };
            if (editId) {
                await wfetch(`/api/whatsapp/templates/local/${editId}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                await wfetch("/api/whatsapp/templates/local", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            router.push("/templates");
        } catch (e) {
            console.error("Save error:", e);
            alert("Failed to save template.");
        } finally { setSaving(false); }
    };

    // Submit for approval
    const handleSubmitForApproval = async () => {
        if (!name.trim() || !body.trim()) { alert("Template name and body are required."); return; }
        if (!confirm("Submit this template for WhatsApp approval? It will be reviewed by Meta.")) return;
        setSubmitting(true);
        try {
            const payload = {
                name: name.trim(), category, language,
                headerType: headerType !== "NONE" ? headerType : null,
                headerContent: headerType !== "NONE" ? headerContent : null,
                body: body.trim(),
                footer: footer.trim() || null,
                buttons: buttons.length > 0 ? buttons : null,
                variableSamples: Object.keys(variableSamples).length > 0 ? variableSamples : null,
            };
            let templateId = editId;
            if (!templateId) {
                const createRes = await wfetch("/api/whatsapp/templates/local", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const created = await createRes.json();
                if (!createRes.ok) { alert(`Failed to create: ${created.error}`); return; }
                templateId = created.id;
            } else {
                await wfetch(`/api/whatsapp/templates/local/${templateId}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const submitRes = await wfetch(`/api/whatsapp/templates/local/${templateId}/submit`, { method: "POST" });
            const submitData = await submitRes.json();
            if (!submitRes.ok) { alert(`Submission failed: ${submitData.error || "Unknown error"}`); return; }
            router.push("/templates");
        } catch (e) {
            console.error("Submit error:", e);
            alert("Failed to submit template.");
        } finally { setSubmitting(false); }
    };

    const handleAddCustomVariable = () => {
        const varName = prompt("Enter variable name (letters, numbers, underscores):");
        if (!varName) return;
        const cleaned = varName.trim().replace(/[^a-zA-Z0-9_]/g, "");
        if (!cleaned) { alert("Invalid variable name."); return; }
        insertVariable(cleaned);
    };

    if (!loaded) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-slate-50">
            {/* Top Bar */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/templates")} className="h-9 w-9">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-lg font-semibold text-slate-800">
                        {editId ? "Edit Template" : "Create Template"}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleSave} disabled={saving || submitting} className="h-9 gap-2">
                        {saving ? <div className="animate-spin w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
                        Save Draft
                    </Button>
                    <Button onClick={handleSubmitForApproval} disabled={saving || submitting || !name.trim() || !body.trim()} className="h-9 gap-2 bg-teal-600 hover:bg-teal-700">
                        {submitting ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Send className="w-4 h-4" />}
                        Submit for Approval
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left: Form (3/5) */}
                <div className="lg:col-span-3 space-y-5">
                    {/* Template Name */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-semibold text-slate-700">Template Name *</Label>
                            <CharCounter current={name.length} max={60} />
                        </div>
                        <Input
                            autoFocus
                            placeholder="e.g. order_update"
                            value={name}
                            onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 60))}
                            className="h-10 font-mono text-sm"
                            maxLength={60}
                        />
                        <p className="text-[11px] text-slate-400 mt-1.5">Lowercase letters, numbers and underscores only</p>
                    </div>

                    {/* Category / Channel / Language */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Category *</Label>
                                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none bg-white">
                                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Channel</Label>
                                <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none bg-white">
                                    {numbers.length === 0 && <option value="">No numbers configured</option>}
                                    {numbers.map((n) => <option key={n.number} value={n.number}>+{n.number} {n.label ? `(${n.label})` : ""}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Language *</Label>
                                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none bg-white">
                                    {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Message Header */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">
                            Message Header <span className="text-slate-400 font-normal">(Optional)</span>
                        </Label>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {HEADER_TYPES.map((ht) => {
                                const Icon = ht.icon;
                                return (
                                    <button key={ht.value} type="button" onClick={() => { setHeaderType(ht.value); if (ht.value === "NONE") setHeaderContent(""); }}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${headerType === ht.value ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                                        <Icon className="w-3.5 h-3.5" />
                                        {ht.label}
                                    </button>
                                );
                            })}
                        </div>

                        {headerType === "TEXT" && (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <Label className="text-xs text-slate-500">Header Text</Label>
                                    <CharCounter current={headerContent.length} max={60} />
                                </div>
                                <Input placeholder="Enter header text..." value={headerContent} onChange={(e) => setHeaderContent(e.target.value.slice(0, 60))} className="h-9 text-sm" maxLength={60} />
                            </div>
                        )}

                        {(headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT") && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <input ref={fileInputRef} type="file" className="hidden"
                                        accept={headerType === "IMAGE" ? "image/jpeg,image/png,image/webp" : headerType === "VIDEO" ? "video/mp4,video/3gpp" : ".pdf,.doc,.docx,.xls,.xlsx"}
                                        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }}
                                    />
                                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-2">
                                        {uploading ? <div className="animate-spin w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full" /> : <Upload className="w-3.5 h-3.5" />}
                                        {uploading ? "Uploading..." : `Upload ${headerType.toLowerCase()}`}
                                    </Button>
                                    <span className="text-[11px] text-slate-400">or</span>
                                </div>
                                <Input placeholder={`Enter ${headerType.toLowerCase()} URL...`} value={headerContent} onChange={(e) => setHeaderContent(e.target.value)} className="h-9 text-sm" />
                                {headerContent && headerType === "IMAGE" && (
                                    <div className="w-24 h-24 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                                        <img src={headerContent} alt="Header" className="w-full h-full object-cover" />
                                    </div>
                                )}
                            </div>
                        )}

                        {headerType === "LOCATION" && (
                            <p className="text-xs text-slate-400">Location header will request the user&apos;s device location. No additional input needed.</p>
                        )}
                    </div>

                    {/* Message Body */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-semibold text-slate-700">Message Body *</Label>
                            <CharCounter current={body.length} max={1024} />
                        </div>
                        <Textarea
                            ref={bodyRef}
                            placeholder={"Hello {{name}}! Your order #{{order_id}} has been shipped."}
                            value={body}
                            onChange={(e) => setBody(e.target.value.slice(0, 1024))}
                            rows={8}
                            className="resize-none text-sm mb-3"
                            maxLength={1024}
                        />
                        <div className="flex items-center justify-between">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-1.5 text-teal-700 border-teal-300 hover:bg-teal-50">
                                        <Plus className="w-3.5 h-3.5" />
                                        Add variables
                                        <ChevronDown className="w-3 h-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400">Contact</DropdownMenuLabel>
                                    {CONTACT_VARIABLES.map((v) => (
                                        <DropdownMenuItem key={v.name} onClick={() => insertVariable(v.name)}>
                                            {v.label}
                                            <span className="ml-auto text-[10px] text-slate-400 font-mono">{`{{${v.name}}}`}</span>
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleAddCustomVariable}>
                                        <Plus className="w-3.5 h-3.5 mr-2 text-teal-600" />
                                        Add Custom
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <div className="flex items-center gap-1">
                                <button type="button" onClick={() => insertFormatting("*")} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Bold (*text*)">
                                    <Bold className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => insertFormatting("_")} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Italic (_text_)">
                                    <Italic className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => insertFormatting("~")} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Strikethrough (~text~)">
                                    <Strikethrough className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Variables Section */}
                    {detectedVars.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 p-5">
                            <Label className="text-sm font-semibold text-slate-700 mb-3 block">Variables</Label>
                            <div className="space-y-2">
                                {detectedVars.map((varName) => (
                                    <div key={varName} className="grid grid-cols-2 gap-3 items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center px-2 py-1 bg-teal-50 text-teal-700 rounded text-xs font-mono">{`{{${varName}}}`}</span>
                                        </div>
                                        <Input
                                            placeholder={varName === "name" ? "Ex: John, Ram, Riya" : varName === "email" ? "Ex: john@example.com" : varName === "phone" ? "Ex: 9876543210" : "Enter sample value..."}
                                            value={variableSamples[varName] || ""}
                                            onChange={(e) => setVariableSamples((prev) => ({ ...prev, [varName]: e.target.value }))}
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-3">
                                Enter a sample value for your variables to give context to the WhatsApp&apos;s template approval team.
                            </p>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-semibold text-slate-700">Footer <span className="text-slate-400 font-normal">(Optional)</span></Label>
                            <CharCounter current={footer.length} max={60} />
                        </div>
                        <Input
                            placeholder="e.g. Reply STOP to unsubscribe, a tagline, a way to unsubscribe, etc."
                            value={footer} onChange={(e) => setFooter(e.target.value.slice(0, 60))} className="h-10 text-sm" maxLength={60}
                        />
                    </div>

                    {/* Buttons */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <Label className="text-sm font-semibold text-slate-700 mb-1 block">Buttons <span className="text-slate-400 font-normal">(Optional)</span></Label>
                        <p className="text-[11px] text-slate-400 mb-4">
                            Create buttons that let customers respond to your message or take action.
                            {buttons.length > 3 && <span className="text-amber-600 font-medium"> If you add more than three buttons, they will appear in a list.</span>}
                        </p>

                        <div className="space-y-3 mb-4">
                            {buttons.map((btn, idx) => (
                                <div key={idx} className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <GripVertical className="w-4 h-4 text-slate-300" />
                                            <span className="text-sm font-semibold text-slate-700">
                                                {btn.type === "QUICK_REPLY" && "Quick reply"}
                                                {btn.type === "URL" && "Visit URL"}
                                                {btn.type === "PHONE_NUMBER" && "Call Phone Number"}
                                                {btn.type === "COPY_CODE" && "Coupon Code"}
                                            </span>
                                        </div>
                                        <button type="button" onClick={() => removeButton(idx)} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {btn.type === "QUICK_REPLY" && (
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <Label className="text-xs text-slate-500">Enter custom button text</Label>
                                                <CharCounter current={btn.text.length} max={25} />
                                            </div>
                                            <Input placeholder="e.g. Yes" value={btn.text} onChange={(e) => updateButton(idx, { text: e.target.value.slice(0, 25) })} className="h-9 text-sm" maxLength={25} />
                                        </div>
                                    )}

                                    {btn.type === "URL" && (
                                        <div className="space-y-3">
                                            <div>
                                                <Label className="text-xs text-slate-500 mb-1 block">URL Type</Label>
                                                <select value={btn.url_type || "static"} onChange={(e) => updateButton(idx, { url_type: e.target.value as "static" | "dynamic" })}
                                                    className="h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none">
                                                    <option value="static">Static URL</option>
                                                    <option value="dynamic">Dynamic URL</option>
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <Label className="text-xs text-slate-500">Button text</Label>
                                                        <CharCounter current={btn.text.length} max={25} />
                                                    </div>
                                                    <Input placeholder="e.g. Visit website" value={btn.text} onChange={(e) => updateButton(idx, { text: e.target.value.slice(0, 25) })} className="h-9 text-sm" maxLength={25} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <Label className="text-xs text-slate-500">Website URL</Label>
                                                        <CharCounter current={(btn.url || "").length} max={2000} />
                                                    </div>
                                                    <Input placeholder="https://www.example.com" value={btn.url || ""} onChange={(e) => updateButton(idx, { url: e.target.value.slice(0, 2000) })} className="h-9 text-sm" maxLength={2000} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {btn.type === "PHONE_NUMBER" && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <Label className="text-xs text-slate-500">Button text</Label>
                                                    <CharCounter current={btn.text.length} max={25} />
                                                </div>
                                                <Input placeholder="e.g. Call us" value={btn.text} onChange={(e) => updateButton(idx, { text: e.target.value.slice(0, 25) })} className="h-9 text-sm" maxLength={25} />
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <Label className="text-xs text-slate-500">Phone Number</Label>
                                                    <CharCounter current={(btn.phone_number || "").length} max={20} />
                                                </div>
                                                <Input placeholder="+91" value={btn.phone_number || ""} onChange={(e) => updateButton(idx, { phone_number: e.target.value.slice(0, 20) })} className="h-9 text-sm" maxLength={20} />
                                            </div>
                                        </div>
                                    )}

                                    {btn.type === "COPY_CODE" && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label className="text-xs text-slate-500 mb-1 block">Button text</Label>
                                                <Input value="Copy code" disabled className="h-9 text-sm bg-slate-100" />
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <Label className="text-xs text-slate-500">Sample Code</Label>
                                                    <CharCounter current={(btn.example || "").length} max={15} />
                                                </div>
                                                <Input placeholder="GET50OFF" value={btn.example || ""} onChange={(e) => updateButton(idx, { example: e.target.value.slice(0, 15) })} className="h-9 text-sm" maxLength={15} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-1.5">
                                    <Plus className="w-3.5 h-3.5" />
                                    Add a button
                                    <ChevronDown className="w-3 h-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400">Quick reply buttons</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => addButton("QUICK_REPLY")}>
                                    <Copy className="w-4 h-4 mr-2 text-slate-400" />
                                    Custom replies
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400">Call to action buttons</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => addButton("URL")} disabled={urlCount >= 2}>
                                    <ExternalLink className="w-4 h-4 mr-2 text-slate-400" />
                                    URL
                                    <span className="ml-auto text-[10px] text-slate-400">2 max</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => addButton("PHONE_NUMBER")} disabled={phoneCount >= 1}>
                                    <Phone className="w-4 h-4 mr-2 text-slate-400" />
                                    Phone
                                    <span className="ml-auto text-[10px] text-slate-400">1 max</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => addButton("COPY_CODE")} disabled={couponCount >= 1}>
                                    <Link2 className="w-4 h-4 mr-2 text-slate-400" />
                                    Coupon code
                                    <span className="ml-auto text-[10px] text-slate-400">1 max</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Right: Live Preview (2/5) */}
                <div className="lg:col-span-2">
                    <div className="sticky top-20">
                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">Preview</Label>
                        <div className="bg-slate-800 rounded-[2rem] p-3 shadow-xl max-w-[340px] mx-auto">
                            <div className="bg-slate-800 rounded-t-[1.5rem] px-4 py-2 flex items-center justify-between">
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-500" /><div className="w-6 h-1 rounded bg-slate-600" /></div>
                                <div className="flex items-center gap-1"><div className="w-3 h-1.5 rounded-sm bg-slate-500" /><div className="w-3 h-1.5 rounded-sm bg-slate-500" /></div>
                            </div>
                            <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
                                <ArrowLeft className="w-4 h-4 text-white/80" />
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><span className="text-white text-xs font-semibold">B</span></div>
                                <div className="flex-1">
                                    <p className="text-white text-sm font-medium">Business</p>
                                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-white/60 text-[10px]">Online</span></div>
                                </div>
                            </div>
                            <div className="bg-[#e5ddd5] min-h-[400px] px-3 py-4 flex flex-col justify-end"
                                 style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c0b8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}>
                                <div className="max-w-[260px]">
                                    <div className="bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden">
                                        {headerType === "TEXT" && headerContent && <div className="px-3 pt-2"><p className="text-sm font-semibold text-slate-800">{headerContent}</p></div>}
                                        {headerType === "IMAGE" && (
                                            <div className="w-full h-32 bg-slate-100 flex items-center justify-center">
                                                {headerContent ? <img src={headerContent} alt="Header" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}
                                            </div>
                                        )}
                                        {headerType === "VIDEO" && <div className="w-full h-32 bg-slate-100 flex items-center justify-center"><Video className="w-8 h-8 text-slate-300" /></div>}
                                        {headerType === "DOCUMENT" && <div className="w-full h-16 bg-slate-100 flex items-center justify-center gap-2 px-3"><FileText className="w-6 h-6 text-red-400" /><span className="text-xs text-slate-500">Document</span></div>}
                                        {headerType === "LOCATION" && <div className="w-full h-24 bg-slate-100 flex items-center justify-center"><MapPin className="w-8 h-8 text-red-400" /></div>}

                                        <div className="px-3 py-2">
                                            {body ? <p className="text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed">{renderPreviewBody(body)}</p> : <p className="text-[13px] text-slate-400 italic">Your message preview...</p>}
                                        </div>

                                        {footer && <div className="px-3 pb-1"><p className="text-[11px] text-slate-400">{footer}</p></div>}
                                        <div className="flex justify-end px-3 pb-2"><span className="text-[10px] text-slate-400">12:00 PM</span></div>

                                        {buttons.length > 0 && (
                                            <div className="border-t border-slate-100">
                                                {buttons.map((btn, idx) => (
                                                    <div key={idx} className="flex items-center justify-center gap-1.5 py-2 border-b border-slate-100 last:border-b-0 text-[#00a5f4]">
                                                        {btn.type === "URL" && <ExternalLink className="w-3 h-3" />}
                                                        {btn.type === "PHONE_NUMBER" && <Phone className="w-3 h-3" />}
                                                        {btn.type === "COPY_CODE" && <Copy className="w-3 h-3" />}
                                                        <span className="text-sm font-medium">
                                                            {btn.text || (btn.type === "QUICK_REPLY" ? "Quick Reply" : btn.type === "URL" ? "Visit Website" : btn.type === "PHONE_NUMBER" ? "Call" : "Copy code")}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-2 rounded-b-[1.5rem]">
                                <div className="flex-1 h-8 bg-white rounded-full px-3 flex items-center"><span className="text-[11px] text-slate-400">Message</span></div>
                                <div className="w-8 h-8 rounded-full bg-[#075e54] flex items-center justify-center"><Send className="w-3.5 h-3.5 text-white" /></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { Label } from "@/components/whatsapp/ui/label";
import { Textarea } from "@/components/whatsapp/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/whatsapp/ui/dialog";

interface TemplateFormData {
    name: string;
    category: string;
    language: string;
    body: string;
    footer: string;
}

interface TemplateFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: TemplateFormData) => Promise<void>;
    initialData?: Partial<TemplateFormData>;
    isEdit?: boolean;
}

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

/** Render template body with highlighted {{N}} variables as React elements */
function renderPreviewBody(text: string) {
    const parts = text.split(/(\{\{\d+\}\})/g);
    return parts.map((part, i) => {
        if (/^\{\{\d+\}\}$/.test(part)) {
            return (
                <span
                    key={i}
                    className="bg-emerald-200 text-emerald-800 px-1 rounded text-xs font-mono"
                >
                    {part}
                </span>
            );
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

export function TemplateFormDialog({
    open,
    onOpenChange,
    onSave,
    initialData,
    isEdit = false,
}: TemplateFormDialogProps) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState("MARKETING");
    const [language, setLanguage] = useState("en");
    const [body, setBody] = useState("");
    const [footer, setFooter] = useState("");
    const [saving, setSaving] = useState(false);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setName(initialData?.name || "");
            setCategory(initialData?.category || "MARKETING");
            setLanguage(initialData?.language || "en");
            setBody(initialData?.body || "");
            setFooter(initialData?.footer || "");
        }
    }, [open, initialData]);

    // Detect variables in body
    const variables = useMemo(() => {
        const matches = body.match(/\{\{(\d+)\}\}/g);
        if (!matches) return [];
        return [...new Set(matches)].sort();
    }, [body]);

    const canSubmit = name.trim() && body.trim();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSaving(true);
        try {
            await onSave({
                name: name.trim(),
                category,
                language,
                body: body.trim(),
                footer: footer.trim(),
            });
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? "Edit Template" : "Create New Template"}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? "Update your message template below."
                            : "Design a message template. Use {{1}}, {{2}} etc. for variables."}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                        {/* Left: Form Fields */}
                        <div className="space-y-4">
                            {/* Name */}
                            <div>
                                <Label className="text-sm text-slate-700 mb-1.5 block">
                                    Template Name *
                                </Label>
                                <Input
                                    autoFocus
                                    placeholder="e.g. order_update"
                                    value={name}
                                    onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))}
                                    className="h-9 font-mono text-sm"
                                    required
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Lowercase, underscores only
                                </p>
                            </div>

                            {/* Category + Language */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-sm text-slate-700 mb-1.5 block">
                                        Category
                                    </Label>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
                                    >
                                        {CATEGORIES.map((c) => (
                                            <option key={c.value} value={c.value}>
                                                {c.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-sm text-slate-700 mb-1.5 block">
                                        Language
                                    </Label>
                                    <select
                                        value={language}
                                        onChange={(e) => setLanguage(e.target.value)}
                                        className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
                                    >
                                        {LANGUAGES.map((l) => (
                                            <option key={l.value} value={l.value}>
                                                {l.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Body */}
                            <div>
                                <Label className="text-sm text-slate-700 mb-1.5 block">
                                    Message Body *
                                </Label>
                                <Textarea
                                    placeholder={"Hello {{1}}! Your order #{{2}} has been shipped."}
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    rows={5}
                                    className="resize-none text-sm"
                                    required
                                />
                                {variables.length > 0 && (
                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        <span className="text-[11px] text-slate-400">Variables:</span>
                                        {variables.map((v) => (
                                            <span
                                                key={v}
                                                className="inline-flex items-center px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[11px] font-mono"
                                            >
                                                {v}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div>
                                <Label className="text-sm text-slate-700 mb-1.5 block">
                                    Footer <span className="text-slate-400">(optional)</span>
                                </Label>
                                <Input
                                    placeholder="Reply STOP to unsubscribe"
                                    value={footer}
                                    onChange={(e) => setFooter(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                        </div>

                        {/* Right: WhatsApp Preview */}
                        <div>
                            <Label className="text-sm text-slate-700 mb-1.5 block">
                                Preview
                            </Label>
                            <div className="rounded-xl border border-slate-200 bg-[#e5ddd5] p-4 min-h-[280px] flex items-start">
                                <div className="max-w-[280px]">
                                    {/* Message bubble */}
                                    <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm">
                                        {body ? (
                                            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                                                {renderPreviewBody(body)}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">
                                                Your message preview will appear here...
                                            </p>
                                        )}
                                        {footer && (
                                            <p className="text-[11px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
                                                {footer}
                                            </p>
                                        )}
                                        <div className="flex justify-end mt-1">
                                            <span className="text-[10px] text-slate-400">
                                                12:00 PM
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="h-9"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={!canSubmit || saving}
                            className="h-9 bg-emerald-500 hover:bg-emerald-600 gap-2"
                        >
                            {saving ? (
                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                                <>
                                    <Send className="w-4 h-4" />
                                    {isEdit ? "Update Template" : "Create Draft"}
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

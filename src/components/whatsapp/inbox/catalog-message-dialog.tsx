"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/whatsapp/ui/dialog";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { Label } from "@/components/whatsapp/ui/label";
import { Textarea } from "@/components/whatsapp/ui/textarea";
import { X, Plus, GripVertical } from "lucide-react";
import { useSendMessage, useSettings } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Conversation } from "@/lib/whatsapp/types";

interface CatalogMessageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: Conversation;
    onSent: () => void;
}

type CatalogSection = {
    title: string;
    productIds: string[];
};

export function CatalogMessageDialog({
    open,
    onOpenChange,
    conversation,
    onSent,
}: CatalogMessageDialogProps) {
    const [mode, setMode] = useState<"single" | "multi">("single");
    const [body, setBody] = useState("");
    const [footer, setFooter] = useState("");
    const [header, setHeader] = useState("");
    const [catalogId, setCatalogId] = useState("");
    const [productId, setProductId] = useState("");
    const [sections, setSections] = useState<CatalogSection[]>([
        { title: "", productIds: [""] },
    ]);

    const sendMessage = useSendMessage();
    const activeNumber = useAppStore((s) => s.activeNumber);
    const { data: settings } = useSettings();

    // Pre-fill catalog ID from settings
    useEffect(() => {
        if (settings?.whatsapp_catalog_id && !catalogId) {
            setCatalogId(settings.whatsapp_catalog_id);
        }
    }, [settings, catalogId]);

    const handleAddSection = () => {
        if (sections.length >= 10) return;
        setSections([...sections, { title: "", productIds: [""] }]);
    };

    const handleRemoveSection = (si: number) => {
        if (sections.length <= 1) return;
        setSections(sections.filter((_, i) => i !== si));
    };

    const handleSectionTitle = (si: number, title: string) => {
        const s = [...sections];
        s[si] = { ...s[si], title };
        setSections(s);
    };

    const handleAddProductId = (si: number) => {
        const s = [...sections];
        if (s[si].productIds.length >= 30) return;
        s[si] = { ...s[si], productIds: [...s[si].productIds, ""] };
        setSections(s);
    };

    const handleRemoveProductId = (si: number, pi: number) => {
        const s = [...sections];
        if (s[si].productIds.length <= 1) return;
        s[si] = { ...s[si], productIds: s[si].productIds.filter((_, i) => i !== pi) };
        setSections(s);
    };

    const handleProductIdChange = (si: number, pi: number, value: string) => {
        const s = [...sections];
        const ids = [...s[si].productIds];
        ids[pi] = value;
        s[si] = { ...s[si], productIds: ids };
        setSections(s);
    };

    const isValid = () => {
        if (!body.trim() || !catalogId.trim()) return false;
        if (mode === "single") return productId.trim().length > 0;
        return sections.every(
            (s) => s.title.trim() && s.productIds.length > 0 && s.productIds.every((id) => id.trim())
        );
    };

    const handleSend = () => {
        if (!isValid()) return;

        let interactivePayload: Record<string, unknown>;

        if (mode === "single") {
            interactivePayload = {
                type: "product",
                body: { text: body.trim() },
                action: {
                    catalog_id: catalogId.trim(),
                    product_retailer_id: productId.trim(),
                },
            };
        } else {
            interactivePayload = {
                type: "product_list",
                body: { text: body.trim() },
                action: {
                    catalog_id: catalogId.trim(),
                    sections: sections.map((s) => ({
                        title: s.title.trim(),
                        product_items: s.productIds
                            .filter((id) => id.trim())
                            .map((id) => ({ product_retailer_id: id.trim() })),
                    })),
                },
            };
            if (header.trim()) {
                interactivePayload.header = { type: "text", text: header.trim() };
            }
        }

        if (footer.trim()) {
            interactivePayload.footer = { text: footer.trim() };
        }

        sendMessage.mutate(
            {
                to: conversation.contact.phone,
                contentType: "interactive",
                conversationId: conversation.id,
                integratedNumber: activeNumber?.number || conversation.integratedNumber,
                interactive: interactivePayload,
            } as any,
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setBody("");
                    setFooter("");
                    setHeader("");
                    setProductId("");
                    setSections([{ title: "", productIds: [""] }]);
                    onSent();
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Send Product Catalog</DialogTitle>
                    <DialogDescription>
                        Share products from your WhatsApp Commerce catalog.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Mode Toggle */}
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                        <button
                            onClick={() => setMode("single")}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                mode === "single" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Single Product
                        </button>
                        <button
                            onClick={() => setMode("multi")}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                mode === "multi" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Multiple Products
                        </button>
                    </div>

                    <div className="space-y-2">
                        <Label>Catalog ID *</Label>
                        <Input
                            placeholder="Your Facebook Commerce catalog ID"
                            value={catalogId}
                            onChange={(e) => setCatalogId(e.target.value)}
                        />
                        <p className="text-[11px] text-slate-400">
                            Set a default in Settings → General → WhatsApp Catalog ID
                        </p>
                    </div>

                    {mode === "multi" && (
                        <div className="space-y-2">
                            <Label>Header (Optional)</Label>
                            <Input
                                placeholder="e.g. Our Products"
                                value={header}
                                onChange={(e) => setHeader(e.target.value)}
                                maxLength={60}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Message Body *</Label>
                        <Textarea
                            placeholder="e.g. Check out our latest collection"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Footer (Optional)</Label>
                        <Input
                            placeholder="e.g. Tap to view details"
                            value={footer}
                            onChange={(e) => setFooter(e.target.value)}
                            maxLength={60}
                        />
                    </div>

                    {/* Single product */}
                    {mode === "single" && (
                        <div className="space-y-2">
                            <Label>Product Retailer ID *</Label>
                            <Input
                                placeholder="e.g. SKU_12345"
                                value={productId}
                                onChange={(e) => setProductId(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Multi product sections */}
                    {mode === "multi" && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Product Sections</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddSection}
                                    disabled={sections.length >= 10}
                                    className="h-7 text-xs"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                                </Button>
                            </div>

                            {sections.map((section, si) => (
                                <div key={si} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <GripVertical className="w-4 h-4 text-slate-300" />
                                        <Input
                                            placeholder={`Section ${si + 1} Title`}
                                            value={section.title}
                                            onChange={(e) => handleSectionTitle(si, e.target.value)}
                                            className="h-8 text-xs font-semibold"
                                        />
                                        {sections.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveSection(si)}
                                                className="h-8 w-8 text-slate-400 hover:text-red-500 shrink-0"
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>

                                    <div className="space-y-2 pl-6">
                                        {section.productIds.map((pid, pi) => (
                                            <div key={pi} className="flex gap-2 items-center">
                                                <Input
                                                    placeholder="Product Retailer ID"
                                                    value={pid}
                                                    onChange={(e) => handleProductIdChange(si, pi, e.target.value)}
                                                    className="h-7 text-xs"
                                                />
                                                {section.productIds.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveProductId(si, pi)}
                                                        className="h-7 w-7 text-slate-300 hover:text-red-500 shrink-0"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleAddProductId(si)}
                                            disabled={section.productIds.length >= 30}
                                            className="h-7 text-xs text-slate-500"
                                        >
                                            <Plus className="w-3 h-3 mr-1" /> Add Product
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSend} disabled={!isValid() || sendMessage.isPending}>
                        {sendMessage.isPending ? "Sending..." : mode === "single" ? "Send Product" : "Send Catalog"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

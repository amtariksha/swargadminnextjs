"use client";

import { useState } from "react";
import { Check, FileText, Search } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/whatsapp/ui/dialog";
import { Input } from "@/components/whatsapp/ui/input";
import { Label } from "@/components/whatsapp/ui/label";
import { Button } from "@/components/whatsapp/ui/button";
import { Badge } from "@/components/whatsapp/ui/badge";
import { ScrollArea } from "@/components/whatsapp/ui/scroll-area";
import { cn, parseTemplateVariables } from "@/lib/whatsapp/utils";
import { useTemplates, useSendMessage } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Conversation, Template } from "@/lib/whatsapp/types";

interface TemplatePickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: Conversation;
}

export function TemplatePickerDialog({
    open,
    onOpenChange,
    conversation,
}: TemplatePickerDialogProps) {
    const { data: templates } = useTemplates();
    const sendMessage = useSendMessage();
    const activeNumber = useAppStore((s) => s.activeNumber);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
        null
    );
    const [variables, setVariables] = useState<Record<string, string>>({});
    const [search, setSearch] = useState("");

    const approvedTemplates = templates?.filter(
        (t) =>
            t.status === "approved" &&
            (search === "" ||
                t.name.toLowerCase().includes(search.toLowerCase()))
    );

    const bodyComponent = selectedTemplate?.components.find(
        (c) => c.type === "BODY"
    );
    const templateVars = bodyComponent
        ? parseTemplateVariables(bodyComponent.text || "")
        : [];

    const handleSend = () => {
        if (!selectedTemplate) return;

        const components: Record<string, { type: string; value: string }> = {};
        templateVars.forEach((v, index) => {
            const key = `body_${index + 1}`;
            components[key] = {
                type: "text",
                value: variables[v] || "",
            };
        });

        sendMessage.mutate({
            to: conversation.contact.phone,
            contentType: "template",
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language,
            components,
            conversationId: conversation.id,
            integratedNumber:
                activeNumber?.number || conversation.integratedNumber,
        });

        setSelectedTemplate(null);
        setVariables({});
        onOpenChange(false);
    };

    const handleBack = () => {
        setSelectedTemplate(null);
        setVariables({});
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <FileText className="w-5 h-5 text-emerald-600" />
                        {selectedTemplate ? "Configure Template" : "Select Template"}
                    </DialogTitle>
                </DialogHeader>

                {!selectedTemplate ? (
                    // ─── Template List ─────────────────────────────────
                    <>
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search templates..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-9"
                            />
                        </div>
                        <ScrollArea className="max-h-[400px]">
                            <div className="space-y-2 pr-1">
                                {approvedTemplates?.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400">
                                        <p className="text-sm">No approved templates found</p>
                                    </div>
                                ) : (
                                    approvedTemplates?.map((tpl) => {
                                        const body = tpl.components.find(
                                            (c) => c.type === "BODY"
                                        );
                                        return (
                                            <button
                                                key={tpl.id}
                                                onClick={() => setSelectedTemplate(tpl)}
                                                className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors"
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-medium text-slate-900">
                                                        {tpl.name.replace(/_/g, " ")}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        <Badge
                                                            variant="secondary"
                                                            className="text-[10px] h-5 bg-slate-100"
                                                        >
                                                            {tpl.category}
                                                        </Badge>
                                                        <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                                            <Check className="w-3 h-3 mr-0.5" />
                                                            Approved
                                                        </Badge>
                                                    </div>
                                                </div>
                                                {body?.text && (
                                                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                                        {body.text}
                                                    </p>
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </>
                ) : (
                    // ─── Variable Form ─────────────────────────────────
                    <div className="space-y-4">
                        {/* Preview */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-slate-700">
                                    {selectedTemplate.name.replace(/_/g, " ")}
                                </span>
                                <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                    {selectedTemplate.language.toUpperCase()}
                                </Badge>
                            </div>
                            <p className="text-xs text-slate-500">{bodyComponent?.text}</p>
                        </div>

                        {/* Variable Inputs */}
                        {templateVars.length > 0 ? (
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-slate-700">
                                    Template Variables
                                </p>
                                {templateVars.map((v, index) => (
                                    <div key={v}>
                                        <Label className="text-xs text-slate-600 mb-1.5Blocked">
                                            Variable {index + 1} ({v})
                                        </Label>
                                        <Input
                                            placeholder={`Enter value for ${v}`}
                                            value={variables[v] || ""}
                                            onChange={(e) =>
                                                setVariables((prev) => ({
                                                    ...prev,
                                                    [v]: e.target.value,
                                                }))
                                            }
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500 py-2">
                                This template has no variables to fill.
                            </p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2">
                            <Button
                                variant="outline"
                                onClick={handleBack}
                                className="flex-1"
                            >
                                Back
                            </Button>
                            <Button
                                onClick={handleSend}
                                disabled={sendMessage.isPending}
                                className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                            >
                                Send Template
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

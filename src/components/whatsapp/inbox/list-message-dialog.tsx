"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/whatsapp/ui/dialog";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { Label } from "@/components/whatsapp/ui/label";
import { Textarea } from "@/components/whatsapp/ui/textarea";
import { X, Plus, GripVertical } from "lucide-react";
import { useSendMessage } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Conversation } from "@/lib/whatsapp/types";

interface ListMessageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: Conversation;
    onSent: () => void;
}

type ListRow = {
    id: string;
    title: string;
    description: string;
};

type ListSection = {
    title: string;
    rows: ListRow[];
};

export function ListMessageDialog({
    open,
    onOpenChange,
    conversation,
    onSent,
}: ListMessageDialogProps) {
    const [header, setHeader] = useState("");
    const [body, setBody] = useState("");
    const [footer, setFooter] = useState("");
    const [buttonText, setButtonText] = useState("View Options");
    const [sections, setSections] = useState<ListSection[]>([
        { title: "", rows: [{ id: `row_${Date.now()}`, title: "", description: "" }] },
    ]);

    const sendMessage = useSendMessage();
    const activeNumber = useAppStore((s) => s.activeNumber);

    const handleAddSection = () => {
        if (sections.length >= 10) return;
        setSections([
            ...sections,
            { title: "", rows: [{ id: `row_${Date.now()}`, title: "", description: "" }] },
        ]);
    };

    const handleRemoveSection = (sectionIndex: number) => {
        if (sections.length <= 1) return;
        setSections(sections.filter((_, i) => i !== sectionIndex));
    };

    const handleSectionTitle = (sectionIndex: number, title: string) => {
        const newSections = [...sections];
        newSections[sectionIndex] = { ...newSections[sectionIndex], title };
        setSections(newSections);
    };

    const handleAddRow = (sectionIndex: number) => {
        const newSections = [...sections];
        if (newSections[sectionIndex].rows.length >= 10) return;
        newSections[sectionIndex] = {
            ...newSections[sectionIndex],
            rows: [
                ...newSections[sectionIndex].rows,
                { id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: "", description: "" },
            ],
        };
        setSections(newSections);
    };

    const handleRemoveRow = (sectionIndex: number, rowIndex: number) => {
        const newSections = [...sections];
        if (newSections[sectionIndex].rows.length <= 1) return;
        newSections[sectionIndex] = {
            ...newSections[sectionIndex],
            rows: newSections[sectionIndex].rows.filter((_, i) => i !== rowIndex),
        };
        setSections(newSections);
    };

    const handleRowChange = (sectionIndex: number, rowIndex: number, field: "title" | "description", value: string) => {
        const newSections = [...sections];
        const newRows = [...newSections[sectionIndex].rows];
        newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
        newSections[sectionIndex] = { ...newSections[sectionIndex], rows: newRows };
        setSections(newSections);
    };

    const isValid = () => {
        if (!body.trim()) return false;
        if (!buttonText.trim()) return false;
        return sections.every(
            (s) => s.title.trim() && s.rows.length > 0 && s.rows.every((r) => r.title.trim())
        );
    };

    const handleSend = () => {
        if (!isValid()) return;

        const interactivePayload: Record<string, unknown> = {
            type: "list",
            body: { text: body.trim() },
            action: {
                button: buttonText.trim(),
                sections: sections.map((s) => ({
                    title: s.title.trim(),
                    rows: s.rows.map((r) => ({
                        id: r.id,
                        title: r.title.trim(),
                        description: r.description.trim() || undefined,
                    })),
                })),
            },
        };

        if (header.trim()) {
            interactivePayload.header = { type: "text", text: header.trim() };
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
                    setHeader("");
                    setBody("");
                    setFooter("");
                    setButtonText("View Options");
                    setSections([{ title: "", rows: [{ id: `row_${Date.now()}`, title: "", description: "" }] }]);
                    onSent();
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Send List Message</DialogTitle>
                    <DialogDescription>
                        Create an interactive list with sections and selectable rows.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Header (Optional)</Label>
                        <Input
                            placeholder="e.g. Our Services"
                            value={header}
                            onChange={(e) => setHeader(e.target.value)}
                            maxLength={60}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Message Body *</Label>
                        <Textarea
                            placeholder="e.g. Please select from the options below"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Footer (Optional)</Label>
                        <Input
                            placeholder="e.g. Reply for help"
                            value={footer}
                            onChange={(e) => setFooter(e.target.value)}
                            maxLength={60}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Menu Button Text *</Label>
                        <Input
                            placeholder="e.g. View Options"
                            value={buttonText}
                            onChange={(e) => setButtonText(e.target.value)}
                            maxLength={20}
                        />
                        <p className="text-[11px] text-slate-400">{buttonText.length}/20 characters</p>
                    </div>

                    {/* Sections */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Sections</Label>
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

                                {/* Rows */}
                                <div className="space-y-2 pl-6">
                                    {section.rows.map((row, ri) => (
                                        <div key={ri} className="flex gap-2 items-start bg-white p-2 rounded border border-slate-100">
                                            <div className="flex-1 grid gap-1.5">
                                                <Input
                                                    placeholder="Row title (max 24)"
                                                    value={row.title}
                                                    onChange={(e) => handleRowChange(si, ri, "title", e.target.value)}
                                                    className="h-7 text-xs"
                                                    maxLength={24}
                                                />
                                                <Input
                                                    placeholder="Description (optional, max 72)"
                                                    value={row.description}
                                                    onChange={(e) => handleRowChange(si, ri, "description", e.target.value)}
                                                    className="h-7 text-xs text-slate-500"
                                                    maxLength={72}
                                                />
                                            </div>
                                            {section.rows.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveRow(si, ri)}
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
                                        onClick={() => handleAddRow(si)}
                                        disabled={section.rows.length >= 10}
                                        className="h-7 text-xs text-slate-500"
                                    >
                                        <Plus className="w-3 h-3 mr-1" /> Add Row
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSend} disabled={!isValid() || sendMessage.isPending}>
                        {sendMessage.isPending ? "Sending..." : "Send List"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

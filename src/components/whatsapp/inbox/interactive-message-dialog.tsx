"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/whatsapp/ui/dialog";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { Label } from "@/components/whatsapp/ui/label";
import { Textarea } from "@/components/whatsapp/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/whatsapp/ui/select";
import { X, Plus, MessageSquareText } from "lucide-react";
import { useSendMessage } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Conversation } from "@/lib/whatsapp/types";

interface InteractiveMessageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: Conversation;
    initialText?: string;
    onSent: () => void;
}

type InteractiveButton = {
    type: "reply" | "url";
    title: string;
    id?: string;
    url?: string;
};

export function InteractiveMessageDialog({
    open,
    onOpenChange,
    conversation,
    initialText = "",
    onSent,
}: InteractiveMessageDialogProps) {
    const [text, setText] = useState(initialText);
    const [footer, setFooter] = useState("");
    const [buttons, setButtons] = useState<InteractiveButton[]>([]);

    const sendMessage = useSendMessage();
    const activeNumber = useAppStore((s) => s.activeNumber);

    const handleAddButton = () => {
        if (buttons.length >= 3) return;
        setButtons([...buttons, { type: "reply", title: "", id: `btn_${Date.now()}` }]);
    };

    const handleRemoveButton = (index: number) => {
        setButtons(buttons.filter((_, i) => i !== index));
    };

    const handleUpdateButton = (index: number, field: keyof InteractiveButton, value: string) => {
        const newButtons = [...buttons];
        newButtons[index] = { ...newButtons[index], [field]: value };
        setButtons(newButtons);
    };

    const handleSend = () => {
        if (!text.trim() || buttons.length === 0) return;

        // Validate buttons
        const validButtons = buttons.filter(b => b.title.trim().length > 0 && b.title.length <= 20);
        if (validButtons.length === 0) return;

        const formattedButtons = validButtons.map((btn, i) => {
            if (btn.type === "url") {
                // MSG91 CTA button
                return {
                    type: "action",
                    action: {
                        type: "url",
                        url: btn.url,
                        title: btn.title
                    }
                };
            } else {
                return {
                    type: "reply",
                    reply: {
                        id: btn.id || `btn_${i}`,
                        title: btn.title
                    }
                };
            }
        });

        // Determine MSG91 interactive payload structure
        // If it has CTA URLs, MSG91 structure might be slightly different. Assuming standard reply buttons for now based on MSG91 docs.
        const hasUrl = validButtons.some(b => b.type === "url");

        let interactivePayload: any = {
            type: "button",
            body: { text },
            action: {
                buttons: formattedButtons
            }
        };

        if (footer.trim()) {
            interactivePayload.footer = { text: footer.trim() };
        }

        if (hasUrl) {
            // Example CTA message. Usually CTA is a type of interactive, let's look at MSG91 standard.
            // Actually, URL buttons might be part of "cta_url" type.
            interactivePayload = {
                type: "cta_url",
                body: { text },
                action: {
                    name: "cta_url",
                    parameters: {
                        display_text: formattedButtons[0].action?.title || validButtons[0].title,
                        url: formattedButtons[0].action?.url || validButtons[0].url
                    }
                }
            };
        }

        sendMessage.mutate(
            {
                to: conversation.contact.phone,
                contentType: "interactive",
                conversationId: conversation.id,
                integratedNumber: activeNumber?.number || conversation.integratedNumber,
                interactive: interactivePayload,
            } as any, // Cast because we know the type
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setText("");
                    setFooter("");
                    setButtons([]);
                    onSent();
                },
            }
        );
    };

    // Reset when opened
    if (open && text !== initialText && initialText && text === "") {
        setText(initialText);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Send Interactive Message</DialogTitle>
                    <DialogDescription>
                        Add up to 3 buttons. Only 1 URL button is allowed by WhatsApp (CTA).
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Message Body</Label>
                        <Textarea
                            placeholder="e.g. Would you like to proceed?"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Footer (Optional)</Label>
                        <Input
                            placeholder="e.g. Reply to choose"
                            value={footer}
                            onChange={(e) => setFooter(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Buttons</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddButton}
                                disabled={buttons.length >= 3}
                                className="h-7 text-xs"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add Button
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {buttons.map((btn, index) => (
                                <div key={index} className="flex gap-2 items-start bg-slate-50 p-2 rounded-md border border-slate-100">
                                    <div className="grid flex-1 gap-2">
                                        <div className="flex gap-2">
                                            <Select
                                                value={btn.type}
                                                onValueChange={(val: any) => handleUpdateButton(index, "type", val)}
                                            >
                                                <SelectTrigger className="w-[110px] h-8 text-xs">
                                                    <SelectValue placeholder="Type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="reply">Quick Reply</SelectItem>
                                                    <SelectItem value="url">URL Link</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            <Input
                                                placeholder="Button Title (Max 20)"
                                                value={btn.title}
                                                onChange={(e) => handleUpdateButton(index, "title", e.target.value)}
                                                className="h-8 text-xs font-medium"
                                                maxLength={20}
                                            />
                                        </div>
                                        {btn.type === "url" && (
                                            <Input
                                                placeholder="https://example.com"
                                                value={btn.url || ""}
                                                onChange={(e) => handleUpdateButton(index, "url", e.target.value)}
                                                className="h-8 text-xs"
                                            />
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveButton(index)}
                                        className="h-8 w-8 text-slate-400 hover:text-red-500"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                            {buttons.length === 0 && (
                                <div className="text-center py-4 bg-slate-50 border border-dashed rounded-md text-sm text-slate-500">
                                    No buttons added.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSend} disabled={!text.trim() || buttons.length === 0 || sendMessage.isPending}>
                        {sendMessage.isPending ? "Sending..." : "Send Message"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

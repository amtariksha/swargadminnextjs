"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/whatsapp/ui/dialog";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { Label } from "@/components/whatsapp/ui/label";
import { Textarea } from "@/components/whatsapp/ui/textarea";
import { X, Plus } from "lucide-react";
import { useWaPayment } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Conversation } from "@/lib/whatsapp/types";

interface WaPaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: Conversation;
    onSent: () => void;
}

type PaymentItem = {
    name: string;
    amount: string;
    quantity: string;
};

export function WaPaymentDialog({
    open,
    onOpenChange,
    conversation,
    onSent,
}: WaPaymentDialogProps) {
    const [bodyText, setBodyText] = useState("");
    const [footerText, setFooterText] = useState("");
    const [headerImageUrl, setHeaderImageUrl] = useState("");
    const [items, setItems] = useState<PaymentItem[]>([
        { name: "", amount: "", quantity: "1" },
    ]);

    const waPayment = useWaPayment();
    const activeNumber = useAppStore((s) => s.activeNumber);

    const handleAddItem = () => {
        if (items.length >= 10) return;
        setItems([...items, { name: "", amount: "", quantity: "1" }]);
    };

    const handleRemoveItem = (index: number) => {
        if (items.length <= 1) return;
        setItems(items.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: keyof PaymentItem, value: string) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };
        setItems(updated);
    };

    const totalAmount = items.reduce((sum, item) => {
        const amt = parseFloat(item.amount) || 0;
        const qty = parseInt(item.quantity) || 1;
        return sum + amt * qty;
    }, 0);

    const isValid = () => {
        if (!bodyText.trim()) return false;
        return items.every(
            (item) => item.name.trim() && parseFloat(item.amount) > 0
        );
    };

    const handleSend = () => {
        if (!isValid()) return;

        waPayment.mutate(
            {
                phone: conversation.contact.phone,
                integratedNumber: activeNumber?.number || conversation.integratedNumber,
                conversationId: conversation.id,
                bodyText: bodyText.trim(),
                footerText: footerText.trim() || undefined,
                headerImageUrl: headerImageUrl.trim() || undefined,
                items: items.map((item) => ({
                    name: item.name.trim(),
                    amount: parseFloat(item.amount) || 0,
                    quantity: parseInt(item.quantity) || 1,
                })),
            },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setBodyText("");
                    setFooterText("");
                    setHeaderImageUrl("");
                    setItems([{ name: "", amount: "", quantity: "1" }]);
                    onSent();
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Send WA Payment Request</DialogTitle>
                    <DialogDescription>
                        Request payment via WhatsApp Native Payments (Cashfree/MSG91).
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Message Body *</Label>
                        <Textarea
                            placeholder="e.g. Please complete payment for your order"
                            value={bodyText}
                            onChange={(e) => setBodyText(e.target.value)}
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Footer (Optional)</Label>
                        <Input
                            placeholder="e.g. Thank you for your purchase"
                            value={footerText}
                            onChange={(e) => setFooterText(e.target.value)}
                            maxLength={60}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Header Image URL (Optional)</Label>
                        <Input
                            placeholder="https://example.com/product-image.jpg"
                            value={headerImageUrl}
                            onChange={(e) => setHeaderImageUrl(e.target.value)}
                        />
                    </div>

                    {/* Items */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Payment Items *</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddItem}
                                disabled={items.length >= 10}
                                className="h-7 text-xs"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                            </Button>
                        </div>

                        {items.map((item, index) => (
                            <div key={index} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                <div className="flex gap-2 items-start">
                                    <div className="flex-1 space-y-2">
                                        <Input
                                            placeholder="Item name"
                                            value={item.name}
                                            onChange={(e) => handleItemChange(index, "name", e.target.value)}
                                            className="h-8 text-xs"
                                        />
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <Input
                                                    type="number"
                                                    placeholder="Amount (₹)"
                                                    value={item.amount}
                                                    onChange={(e) => handleItemChange(index, "amount", e.target.value)}
                                                    className="h-8 text-xs"
                                                    min="0"
                                                    step="0.01"
                                                />
                                            </div>
                                            <div className="w-20">
                                                <Input
                                                    type="number"
                                                    placeholder="Qty"
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                                                    className="h-8 text-xs"
                                                    min="1"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {items.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveItem(index)}
                                            className="h-8 w-8 text-slate-400 hover:text-red-500 shrink-0"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Total */}
                        <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-200">
                            <span className="text-sm font-medium text-slate-600">Total:</span>
                            <span className="text-lg font-bold text-slate-900">
                                ₹{totalAmount.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSend} disabled={!isValid() || waPayment.isPending}>
                        {waPayment.isPending ? "Sending..." : `Send Payment ₹${totalAmount.toFixed(2)}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

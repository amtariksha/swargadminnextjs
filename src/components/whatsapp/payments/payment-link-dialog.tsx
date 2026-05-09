"use client";

import { useState, useEffect } from "react";
import { IndianRupee, Send } from "lucide-react";
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
import { useCreatePayment } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";

interface PaymentLinkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // Optional: pre-fill from a conversation
    conversationId?: string;
    contactId?: string;
    contactName?: string;
    phone?: string;
}

export function PaymentLinkDialog({
    open,
    onOpenChange,
    conversationId,
    contactId,
    contactName: initialName,
    phone: initialPhone,
}: PaymentLinkDialogProps) {
    const { mutate: createPayment, isPending } = useCreatePayment();
    const activeNumber = useAppStore((s) => s.activeNumber);

    const [name, setName] = useState(initialName || "");
    const [phone, setPhone] = useState(initialPhone || "");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [sendViaWA, setSendViaWA] = useState(true);

    // Reset form when dialog opens with new props
    useEffect(() => {
        if (open) {
            setName(initialName || "");
            setPhone(initialPhone || "");
            setAmount("");
            setDescription("");
            setSendViaWA(true);
        }
    }, [open, initialName, initialPhone]);

    const canSubmit =
        name.trim() && phone.trim() && amount && parseFloat(amount) > 0;

    const handleSubmit = () => {
        if (!canSubmit) return;

        createPayment(
            {
                contactName: name.trim(),
                phone: phone.replace(/\s/g, "").replace(/^\+/, ""),
                amount: parseFloat(amount),
                description: description.trim() || undefined,
                contactId: contactId || undefined,
                conversationId: conversationId || undefined,
                integratedNumber: activeNumber?.number || undefined,
                sendViaWhatsApp: sendViaWA,
            },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setName(initialName || "");
                    setPhone(initialPhone || "");
                    setAmount("");
                    setDescription("");
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <IndianRupee className="w-5 h-5 text-emerald-600" />
                        Create Payment Link
                    </DialogTitle>
                    <DialogDescription>
                        Generate a Razorpay payment link and optionally send it via
                        WhatsApp.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    <div>
                        <Label className="text-sm text-slate-700 mb-1.5 block">
                            Contact Name *
                        </Label>
                        <Input
                            placeholder="e.g. Rahul Sharma"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="h-9"
                        />
                    </div>

                    <div>
                        <Label className="text-sm text-slate-700 mb-1.5 block">
                            Phone Number *
                        </Label>
                        <Input
                            placeholder="e.g. 919876543210"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="h-9"
                        />
                    </div>

                    <div>
                        <Label className="text-sm text-slate-700 mb-1.5 block">
                            Amount (₹) *
                        </Label>
                        <Input
                            type="number"
                            placeholder="0.00"
                            min="1"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="h-9 text-lg font-semibold"
                        />
                    </div>

                    <div>
                        <Label className="text-sm text-slate-700 mb-1.5 block">
                            Description
                        </Label>
                        <Textarea
                            placeholder="e.g. Monthly milk subscription"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="resize-none text-sm"
                        />
                    </div>

                    <label className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={sendViaWA}
                            onChange={(e) => setSendViaWA(e.target.checked)}
                            className="w-4 h-4 accent-emerald-500"
                        />
                        <div>
                            <p className="text-sm font-medium text-emerald-800">
                                Send via WhatsApp
                            </p>
                            <p className="text-xs text-emerald-600">
                                Payment link will be sent as a message{!conversationId ? " (uses template if session expired)" : ""}
                            </p>
                        </div>
                    </label>

                    <Button
                        onClick={handleSubmit}
                        disabled={!canSubmit || isPending}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 gap-2 h-10"
                    >
                        {isPending ? (
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Create Payment Link
                                {amount && parseFloat(amount) > 0 && (
                                    <span className="ml-1">
                                        — ₹{parseFloat(amount).toLocaleString("en-IN")}
                                    </span>
                                )}
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

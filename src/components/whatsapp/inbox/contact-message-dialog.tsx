import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/whatsapp/ui/dialog";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { Label } from "@/components/whatsapp/ui/label";
import { useSendMessage } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Conversation } from "@/lib/whatsapp/types";

interface ContactMessageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: Conversation;
    onSent: () => void;
}

export function ContactMessageDialog({
    open,
    onOpenChange,
    conversation,
    onSent,
}: ContactMessageDialogProps) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");

    const sendMessage = useSendMessage();
    const activeNumber = useAppStore((s) => s.activeNumber);

    const handleSend = () => {
        if (!firstName || !phone) return;

        const formattedName = lastName ? `${firstName} ${lastName}` : firstName;

        sendMessage.mutate(
            {
                to: conversation.contact.phone,
                contentType: "contact",
                conversationId: conversation.id,
                integratedNumber: activeNumber?.number || conversation.integratedNumber,
                contacts: [
                    {
                        name: {
                            first_name: firstName.trim(),
                            last_name: lastName.trim() || undefined,
                            formatted_name: formattedName.trim(),
                        },
                        phones: [
                            {
                                phone: phone.trim(),
                                type: "WORK",
                            },
                        ],
                    },
                ],
            } as any,
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setFirstName("");
                    setLastName("");
                    setPhone("");
                    onSent();
                },
            }
        );
    };

    const isFormValid = Boolean(firstName && phone);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Send Contact (vCard)</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="contact-first-name">First Name *</Label>
                            <Input
                                id="contact-first-name"
                                placeholder="John"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="contact-last-name">Last Name</Label>
                            <Input
                                id="contact-last-name"
                                placeholder="Doe"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="contact-phone">Phone Number *</Label>
                        <Input
                            id="contact-phone"
                            placeholder="+919876543210"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSend} disabled={!isFormValid || sendMessage.isPending}>
                        {sendMessage.isPending ? "Sending..." : "Send Contact"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

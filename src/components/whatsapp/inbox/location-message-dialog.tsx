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

interface LocationMessageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: Conversation;
    onSent: () => void;
}

export function LocationMessageDialog({
    open,
    onOpenChange,
    conversation,
    onSent,
}: LocationMessageDialogProps) {
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [latitude, setLatitude] = useState("");
    const [longitude, setLongitude] = useState("");

    const sendMessage = useSendMessage();
    const activeNumber = useAppStore((s) => s.activeNumber);

    const handleSend = () => {
        if (!latitude || !longitude) return;

        sendMessage.mutate(
            {
                to: conversation.contact.phone,
                contentType: "location",
                conversationId: conversation.id,
                integratedNumber: activeNumber?.number || conversation.integratedNumber,
                location: {
                    longitude: parseFloat(longitude),
                    latitude: parseFloat(latitude),
                    name: name.trim() || "Shared Location",
                    address: address.trim(),
                },
            } as any, // Cast because we know the type is handled
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setName("");
                    setAddress("");
                    setLatitude("");
                    setLongitude("");
                    onSent();
                },
            }
        );
    };

    const isFormValid = Boolean(latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude)));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Send Location</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="location-name">Location Name</Label>
                        <Input
                            id="location-name"
                            placeholder="e.g. Main Office"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="location-address">Address (Optional)</Label>
                        <Input
                            id="location-address"
                            placeholder="e.g. 123 Business Rd, City"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="location-lat">Latitude *</Label>
                            <Input
                                id="location-lat"
                                placeholder="28.7041"
                                type="number"
                                step="any"
                                value={latitude}
                                onChange={(e) => setLatitude(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="location-lng">Longitude *</Label>
                            <Input
                                id="location-lng"
                                placeholder="77.1025"
                                type="number"
                                step="any"
                                value={longitude}
                                onChange={(e) => setLongitude(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSend} disabled={!isFormValid || sendMessage.isPending}>
                        {sendMessage.isPending ? "Sending..." : "Send Location"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

"use client";

import { useState } from "react";
import { Clock, X } from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Input } from "@/components/whatsapp/ui/input";
import { useCreateReminder } from "@/lib/whatsapp/hooks";

interface ReminderDialogProps {
    conversationId: string;
    onClose: () => void;
}

export function ReminderDialog({ conversationId, onClose }: ReminderDialogProps) {
    const createReminder = useCreateReminder();
    const [remindAt, setRemindAt] = useState("");
    const [note, setNote] = useState("");

    // Quick presets
    const presets = [
        { label: "30 min", mins: 30 },
        { label: "1 hour", mins: 60 },
        { label: "3 hours", mins: 180 },
        { label: "Tomorrow 9 AM", mins: -1 },
    ];

    const getPresetTime = (mins: number) => {
        if (mins === -1) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            return tomorrow.toISOString();
        }
        return new Date(Date.now() + mins * 60 * 1000).toISOString();
    };

    const handleSubmit = (time?: string) => {
        const finalTime = time || new Date(remindAt).toISOString();
        if (!finalTime || finalTime === "Invalid Date") return;

        createReminder.mutate(
            {
                conversationId,
                remindAt: finalTime,
                note: note || undefined,
            },
            {
                onSuccess: () => onClose(),
            }
        );
    };

    return (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-xl p-5 w-[380px] max-w-[90vw]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-emerald-600" />
                        <h3 className="text-sm font-semibold text-slate-900">Set Reminder</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Quick presets */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {presets.map((p) => (
                        <Button
                            key={p.label}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => handleSubmit(getPresetTime(p.mins))}
                            disabled={createReminder.isPending}
                        >
                            {p.label}
                        </Button>
                    ))}
                </div>

                {/* Custom time */}
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">
                            Custom date & time
                        </label>
                        <Input
                            type="datetime-local"
                            value={remindAt}
                            onChange={(e) => setRemindAt(e.target.value)}
                            className="text-sm h-9"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">
                            Note (optional)
                        </label>
                        <Input
                            placeholder="e.g., Follow up on order status"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="text-sm h-9"
                        />
                    </div>
                    <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                        onClick={() => handleSubmit()}
                        disabled={!remindAt || createReminder.isPending}
                    >
                        {createReminder.isPending ? "Setting..." : "Set Reminder"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

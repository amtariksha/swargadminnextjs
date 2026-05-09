"use client";

import { useState } from "react";
import { Bell, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Badge } from "@/components/whatsapp/ui/badge";
import { useReminders, useDismissReminder } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Reminder } from "@/lib/whatsapp/types";

export function ReminderPopover() {
    const { data: reminders } = useReminders();
    const dismissReminder = useDismissReminder();
    const setActiveConversation = useAppStore((s) => s.setActiveConversation);
    const [open, setOpen] = useState(false);

    const dueReminders = (reminders || []).filter(
        (r: Reminder) => new Date(r.remindAt) <= new Date()
    );
    const upcomingReminders = (reminders || []).filter(
        (r: Reminder) => new Date(r.remindAt) > new Date()
    );
    const totalCount = dueReminders.length + upcomingReminders.length;

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) {
            return d.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            });
        }
        return d.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        });
    };

    return (
        <div className="relative">
            <Button
                variant="ghost"
                size="sm"
                className="relative w-9 h-9 p-0"
                onClick={() => setOpen(!open)}
            >
                <Bell className="w-4 h-4" />
                {dueReminders.length > 0 && (
                    <Badge className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-500 text-white text-[9px] h-4 min-w-4 flex items-center justify-center rounded-full px-1">
                        {dueReminders.length}
                    </Badge>
                )}
            </Button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute left-full ml-2 top-0 w-72 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-[400px] overflow-y-auto">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                            <span className="text-xs font-semibold text-slate-700">
                                Reminders ({totalCount})
                            </span>
                            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {totalCount === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400">
                                No reminders set
                            </div>
                        ) : (
                            <div className="py-1">
                                {dueReminders.length > 0 && (
                                    <div className="px-3 py-1">
                                        <span className="text-[10px] font-semibold uppercase text-red-500">
                                            Due
                                        </span>
                                    </div>
                                )}
                                {dueReminders.map((r: Reminder) => (
                                    <div key={r.id} className="px-3 py-2 hover:bg-red-50/50 border-l-2 border-red-400">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-medium text-slate-800 truncate">
                                                    {r.contactName}
                                                </p>
                                                {r.note && (
                                                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                        {r.note}
                                                    </p>
                                                )}
                                                <p className="text-[10px] text-red-500 mt-0.5">
                                                    {formatTime(r.remindAt)}
                                                </p>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0">
                                                <button
                                                    onClick={() => {
                                                        setActiveConversation(r.conversationId);
                                                        setOpen(false);
                                                    }}
                                                    className="p-1 text-slate-400 hover:text-emerald-600 rounded"
                                                    title="Go to conversation"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={() => dismissReminder.mutate(r.id)}
                                                    className="p-1 text-slate-400 hover:text-red-500 rounded"
                                                    title="Dismiss"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {upcomingReminders.length > 0 && (
                                    <div className="px-3 py-1 mt-1">
                                        <span className="text-[10px] font-semibold uppercase text-slate-400">
                                            Upcoming
                                        </span>
                                    </div>
                                )}
                                {upcomingReminders.map((r: Reminder) => (
                                    <div key={r.id} className="px-3 py-2 hover:bg-slate-50">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-medium text-slate-700 truncate">
                                                    {r.contactName}
                                                </p>
                                                {r.note && (
                                                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                        {r.note}
                                                    </p>
                                                )}
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                    {formatTime(r.remindAt)}
                                                </p>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0">
                                                <button
                                                    onClick={() => {
                                                        setActiveConversation(r.conversationId);
                                                        setOpen(false);
                                                    }}
                                                    className="p-1 text-slate-400 hover:text-emerald-600 rounded"
                                                    title="Go to conversation"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={() => dismissReminder.mutate(r.id)}
                                                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                                    title="Dismiss"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

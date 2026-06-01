"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useNumbers } from "@/lib/whatsapp/hooks";
import { ChatList } from "./chat-list";
import { ChatWindow } from "./chat-window";
import { ContactDetails } from "./contact-details";
import { useAppStore } from "@/lib/whatsapp/store";
import { cn } from "@/lib/whatsapp/utils";

/**
 * Per-number inbox. Each business number has its own route (/whatsapp/[number]);
 * this view filters the conversation list to `number`, keeps the store's
 * activeNumber in sync (so the composer sends from the right number), and shows
 * a switcher to hop between numbers.
 */
export function InboxView({ number }: { number: string }) {
    useNumbers(); // ensure numbers are loaded into the store
    const {
        numbers,
        activeNumber,
        setActiveNumber,
        activeConversationId,
        setActiveConversation,
    } = useAppStore();

    // Switching inbox routes should close any open conversation from the
    // previous number so the chat window doesn't show a foreign thread.
    useEffect(() => {
        setActiveConversation(null);
    }, [number, setActiveConversation]);

    // Keep the store's active number aligned with the route — the composer and
    // other send surfaces read activeNumber to choose the sender.
    useEffect(() => {
        const match = numbers.find((n) => n.number === number);
        if (match && activeNumber?.number !== match.number) {
            setActiveNumber(match);
        }
    }, [number, numbers, activeNumber, setActiveNumber]);

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {/* Per-number switcher */}
            {numbers.length > 1 && (
                <div
                    className={cn(
                        "border-b border-slate-200 bg-white px-3 py-2 gap-2 items-center",
                        activeConversationId ? "hidden lg:flex" : "flex"
                    )}
                >
                    {numbers.map((n) => (
                        <Link
                            key={n.id}
                            href={`/whatsapp/${n.number}`}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                n.number === number
                                    ? "bg-emerald-500 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                        >
                            {n.label || n.number}
                        </Link>
                    ))}
                </div>
            )}

            {/* 3-pane inbox */}
            <div className="flex flex-1 min-h-0 w-full overflow-hidden relative">
                <ChatList
                    integratedNumber={number}
                    className={activeConversationId ? "hidden lg:flex" : "flex w-full lg:w-[340px]"}
                />
                <ChatWindow
                    className={activeConversationId ? "flex w-full lg:flex-1" : "hidden lg:flex lg:flex-1"}
                />
                <ContactDetails
                    className={activeConversationId ? "hidden lg:block" : "hidden"}
                />
            </div>
        </div>
    );
}

"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/whatsapp/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/whatsapp/ui/tabs";
import { Badge } from "@/components/whatsapp/ui/badge";
import { Avatar, AvatarFallback } from "@/components/whatsapp/ui/avatar";
import { cn, formatChatTime, truncate, getContactDisplayName } from "@/lib/whatsapp/utils";
import { useConversations } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Conversation } from "@/lib/whatsapp/types";
import { SessionTimer } from "./session-timer";

export function ChatList({ className }: { className?: string }) {
    const [status, setStatus] = useState("all");
    const [search, setSearch] = useState("");
    const { activeConversationId, setActiveConversation } = useAppStore();
    const { data: conversations, isLoading } = useConversations(status, search);

    return (
        <div className={cn("flex-col h-full border-r border-slate-200 bg-white", className)}>
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Messages</h2>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search by name or phone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-9 text-sm bg-slate-50 border-slate-200"
                    />
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-4 py-2 border-b border-slate-100">
                <Tabs value={status} onValueChange={setStatus}>
                    <TabsList className="w-full h-9 bg-slate-100 p-0.5">
                        <TabsTrigger
                            value="all"
                            className="flex-1 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                            All
                        </TabsTrigger>
                        <TabsTrigger
                            value="open"
                            className="flex-1 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                            Open
                        </TabsTrigger>
                        <TabsTrigger
                            value="resolved"
                            className="flex-1 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                            Resolved
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                    </div>
                ) : conversations?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Search className="w-8 h-8 mb-2" />
                        <p className="text-sm">No conversations found</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {conversations?.map((conv) => (
                            <ConversationItem
                                key={conv.id}
                                conversation={conv}
                                isActive={conv.id === activeConversationId}
                                onClick={() => setActiveConversation(conv.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function ConversationItem({
    conversation,
    isActive,
    onClick,
}: {
    conversation: Conversation;
    isActive: boolean;
    onClick: () => void;
}) {
    // Determine contact name or fallback to phone
    const displayName = getContactDisplayName(conversation.contact);

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex flex-col gap-1 px-4 py-3 text-left transition-colors duration-100 hover:bg-slate-50 border-b border-slate-100",
                isActive && "bg-blue-50/50 border-l-4 border-l-blue-400 hover:bg-blue-50/50"
            )}
        >
            <div className="flex items-start justify-between w-full mb-1">
                <span
                    className={cn(
                        "text-sm font-semibold truncate pr-2 flex items-center gap-1.5",
                        isActive ? "text-slate-900" : "text-slate-700"
                    )}
                >
                    {displayName}
                    {conversation.source === "ctwa" && (
                        <span className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-bold bg-green-100 text-green-700 flex-shrink-0" title="This conversation started from a WhatsApp ad">
                            Ad
                        </span>
                    )}
                </span>
                <span className="text-[10px] text-slate-400 flex-shrink-0 pt-0.5">
                    {formatChatTime(conversation.lastMessageTime)}
                </span>
            </div>

            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5 text-slate-500 truncate pr-2">
                    {/* Placeholder icon representing the person or subscription */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    <p className="text-[11px] truncate">
                        {truncate(conversation.lastMessage || "No messages yet", 40)}
                    </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {conversation.unreadCount > 0 && (
                        <Badge className="bg-amber-400 hover:bg-amber-500 text-amber-950 text-[10px] h-4 min-w-[16px] flex items-center justify-center rounded-full px-1 border-none font-bold">
                            {conversation.unreadCount}
                        </Badge>
                    )}
                    {conversation.lastIncomingTimestamp && (
                        <SessionTimer
                            lastIncomingTimestamp={conversation.lastIncomingTimestamp}
                            className="w-3 h-3 text-slate-300"
                            showLabel={false}
                        />
                    )}
                </div>
            </div>

            {/* Third row for extra info if assigned or resolved */}
            {(conversation.status === "resolved" || conversation.assignedTo) && (
                <div className="flex items-center gap-2 pt-1.5">
                    {conversation.status === "resolved" && (
                        <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Resolved</span>
                    )}
                    {conversation.assignedTo && (
                        <span className="text-[9px] font-medium text-indigo-400 uppercase tracking-wider">Assigned</span>
                    )}
                </div>
            )}
        </button>
    );
}

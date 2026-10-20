"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    Image as ImageIcon,
    UserPlus,
    XCircle,
    Bell,
    RefreshCw,
    ChevronDown,
    ChevronLeft,
    MessageSquareText,
    Phone as PhoneIcon,
    Megaphone,
    ExternalLink,
} from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Badge } from "@/components/whatsapp/ui/badge";
import { Avatar, AvatarFallback } from "@/components/whatsapp/ui/avatar";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/whatsapp/ui/tooltip";
import { cn, getContactDisplayName, getContactInitials } from "@/lib/whatsapp/utils";
import {
    useConversation,
    useUpdateConversationStatus,
    useAssignConversation,
    useVoiceCall,
    useCTWALogForConversation,
    useMarkAsRead,
} from "@/lib/whatsapp/hooks";
import { useAssignableUsers } from "@/lib/whatsapp/use-assignable-users";
import { useAppStore } from "@/lib/whatsapp/store";
import { useAuth } from "@/components/whatsapp/auth-provider";
import { MessageComposer } from "./message-composer";
import { MessageThread } from "./message-thread";
import { ReminderDialog } from "./reminder-dialog";
import type { CTWALog } from "@/lib/whatsapp/types";
import { SessionTimer } from "./session-timer";

function CTWAReferralBanner({ log }: { log: CTWALog }) {
    return (
        <div className="mx-4 mb-3 rounded-lg border border-green-200 bg-green-50/70 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-green-100/60 border-b border-green-200">
                <Megaphone className="w-3.5 h-3.5 text-green-700" />
                <span className="text-xs font-semibold text-green-800">
                    From WhatsApp Ad
                </span>
                {log.campaignName && (
                    <span className="text-xs text-green-600 ml-auto truncate max-w-[200px]">
                        {log.campaignName}
                    </span>
                )}
            </div>
            <div className="px-3 py-2 space-y-1.5">
                {log.headline && (
                    <p className="text-sm font-medium text-slate-800">{log.headline}</p>
                )}
                {log.body && (
                    <p className="text-xs text-slate-600 line-clamp-2">{log.body}</p>
                )}
                {log.mediaUrl && (
                    <div className="rounded overflow-hidden border border-green-200 max-w-[200px]">
                        <img src={log.mediaUrl} alt="Ad media" className="w-full h-auto max-h-32 object-cover" />
                    </div>
                )}
                {log.sourceUrl && (
                    <a
                        href={log.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 hover:underline"
                    >
                        View ad source <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>
        </div>
    );
}

export function ChatWindow({ className }: { className?: string }) {
    const { activeConversationId, setActiveConversation } = useAppStore();
    const toggleContactPanel = useAppStore((s) => s.toggleContactPanel);
    const {
        data: conversation,
        isLoading,
        isFetching,
        refetch: refetchConversation,
    } = useConversation(activeConversationId);
    const queryClient = useQueryClient();
    const updateStatus = useUpdateConversationStatus();
    const assignConversation = useAssignConversation();
    const voiceCall = useVoiceCall();
    const activeNumber = useAppStore((s) => s.activeNumber);
    const { users } = useAssignableUsers();
    const { user: currentUser } = useAuth();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showAssignMenu, setShowAssignMenu] = useState(false);
    const [showReminderDialog, setShowReminderDialog] = useState(false);
    const { data: ctwaLog } = useCTWALogForConversation(
        activeConversationId,
        conversation?.source
    );
    const markAsRead = useMarkAsRead();

    // Mark conversation as read when it's opened / has unread messages
    useEffect(() => {
        if (activeConversationId && conversation && conversation.unreadCount > 0) {
            markAsRead(activeConversationId);
        }
    }, [activeConversationId, conversation?.unreadCount, markAsRead]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [conversation?.messages]);

    // Close assignment menu when clicking outside
    useEffect(() => {
        if (!showAssignMenu) return;
        const handleClick = () => setShowAssignMenu(false);
        document.addEventListener("click", handleClick);
        return () => document.removeEventListener("click", handleClick);
    }, [showAssignMenu]);

    if (!activeConversationId) {
        return (
            <div className={cn("hidden lg:flex flex-col items-center justify-center flex-1 bg-slate-50 text-slate-400 gap-4", className)}>
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                    <MessageSquareText className="w-8 h-8 text-slate-300" />
                </div>
                <p>Select a conversation to start messaging</p>
            </div>
        );
    }

    if (isLoading || !conversation) {
        return (
            <div className={cn("flex flex-col items-center justify-center flex-1 bg-slate-50", className)}>
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    const displayName = getContactDisplayName(conversation.contact);
    const initials = getContactInitials(conversation.contact);

    const isAssignedToMe = conversation.assignedTo === currentUser?.id;
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
    const canClose = isAssignedToMe || isAdmin;
    // Assignable agents = admin-panel users with WhatsApp access.
    const activeUsers = users || [];

    const handleAssign = (userId: string | null, userName?: string | null) => {
        assignConversation.mutate({ id: conversation.id, userId, userName });
        setShowAssignMenu(false);
    };

    const unreadMessagesCount = conversation.messages?.filter(
        (m) => m.direction === "inbound" && m.status !== "read"
    ).length || 0;

    return (
        <div className={cn("flex flex-col h-full bg-white relative", className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                <div className="flex items-center w-full">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden -ml-2 mr-2 text-slate-500 flex-shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveConversation(null);
                        }}
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <button
                        onClick={toggleContactPanel}
                        className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-1 text-left overflow-hidden pr-4"
                    >
                        <Avatar className="w-10 h-10 border border-slate-100 flex-shrink-0">
                            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-medium text-xs">
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col items-start bg-transparent min-w-0">
                            <span className="text-sm font-semibold text-slate-900 truncate w-full">
                                {displayName}
                            </span>
                            <div className="flex items-center gap-1.5 w-full">
                                <span className="text-xs text-slate-500 truncate">
                                    +{conversation.contact.phone}
                                </span>
                                {/* Session Timer */}
                                {conversation.lastIncomingTimestamp && (
                                    <SessionTimer
                                        lastIncomingTimestamp={conversation.lastIncomingTimestamp}
                                        className="w-3.5 h-3.5 flex-shrink-0"
                                        showLabel={false}
                                    />
                                )}
                            </div>
                        </div>
                    </button>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Assigned badge */}
                    {conversation.assignedName && (
                        <Badge
                            variant="secondary"
                            className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200"
                        >
                            <UserPlus className="w-3 h-3 mr-1" />
                            {conversation.assignedName}
                        </Badge>
                    )}

                    {/* Assignment dropdown */}
                    <div className="relative">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowAssignMenu(!showAssignMenu);
                            }}
                            className="text-xs h-8 gap-1"
                        >
                            <UserPlus className="w-3.5 h-3.5" />
                            Assign
                            <ChevronDown className="w-3 h-3" />
                        </Button>

                        {showAssignMenu && (
                            <div
                                className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-slate-200 z-50 py-1"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Assign to me */}
                                {!isAssignedToMe && currentUser && (
                                    <button
                                        onClick={() => handleAssign(
                                            currentUser.id,
                                            activeUsers.find((u) => u.id === currentUser.id)?.name || currentUser.name
                                        )}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 text-emerald-700 font-medium flex items-center gap-2"
                                    >
                                        <UserPlus className="w-3.5 h-3.5" />
                                        Assign to me
                                    </button>
                                )}

                                {conversation.assignedTo && (
                                    <button
                                        onClick={() => handleAssign(null)}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                                    >
                                        <XCircle className="w-3.5 h-3.5" />
                                        Unassign
                                    </button>
                                )}

                                <div className="border-t border-slate-100 my-1" />

                                {activeUsers
                                    .filter((u) => u.id !== conversation.assignedTo)
                                    .map((u) => (
                                        <button
                                            key={u.id}
                                            onClick={() => handleAssign(u.id, u.name)}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700"
                                        >
                                            {u.name}
                                            {u.email && (
                                                <span className="text-xs text-slate-400 ml-1">
                                                    ({u.email})
                                                </span>
                                            )}
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>

                    {/* Voice Call button */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={voiceCall.isPending}
                                onClick={() => {
                                    if (confirm(`Initiate a WhatsApp voice call to +${conversation.contact.phone}?`)) {
                                        voiceCall.mutate({
                                            phone: conversation.contact.phone,
                                            integratedNumber: activeNumber?.number || conversation.integratedNumber,
                                            conversationId: conversation.id,
                                        });
                                    }
                                }}
                                className="text-xs h-8"
                            >
                                <PhoneIcon className={`w-3.5 h-3.5 ${voiceCall.isPending ? "animate-pulse" : ""}`} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {voiceCall.isPending ? "Calling..." : "WhatsApp Voice Call"}
                        </TooltipContent>
                    </Tooltip>

                    {/* Refresh — re-pull THIS conversation on demand (the open
                        chat also auto-polls every 5s while the tab is focused;
                        this covers the impatient path + an unfocused tab). */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            refetchConversation();
                            queryClient.invalidateQueries({ queryKey: ["conversations"] });
                        }}
                        className="text-xs h-8"
                        title="Refresh conversation"
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
                    </Button>

                    {/* Reminder button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowReminderDialog(true)}
                        className="text-xs h-8"
                        title="Set Reminder"
                    >
                        <Bell className="w-3.5 h-3.5" />
                    </Button>

                    {/* Status badge */}
                    <Badge
                        variant="secondary"
                        className={cn(
                            "text-xs",
                            conversation.status === "open"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-slate-100 text-slate-500"
                        )}
                    >
                        {conversation.status === "open" ? "Open" : "Resolved"}
                    </Badge>

                    {/* Close / Reopen button */}
                    {conversation.status === "open" ? (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!canClose}
                            onClick={() =>
                                updateStatus.mutate({
                                    id: conversation.id,
                                    status: "resolved",
                                })
                            }
                            className={cn(
                                "text-xs h-8",
                                canClose
                                    ? "text-red-600 border-red-200 hover:bg-red-50"
                                    : "text-slate-400 border-slate-200 cursor-not-allowed"
                            )}
                            title={
                                canClose
                                    ? "Close this conversation"
                                    : "Only the assigned user or admin can close"
                            }
                        >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Close
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                updateStatus.mutate({
                                    id: conversation.id,
                                    status: "open",
                                })
                            }
                            className="text-xs h-8 text-blue-700 border-blue-200 hover:bg-blue-50"
                        >
                            Reopen
                        </Button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4" ref={scrollRef}>
                {ctwaLog && <CTWAReferralBanner log={ctwaLog} />}
                <MessageThread messages={conversation.messages} />
            </div>

            {/* Composer */}
            <MessageComposer conversation={conversation} />

            {/* Reminder Dialog */}
            {showReminderDialog && (
                <ReminderDialog
                    conversationId={conversation.id}
                    onClose={() => setShowReminderDialog(false)}
                />
            )}
        </div>
    );
}

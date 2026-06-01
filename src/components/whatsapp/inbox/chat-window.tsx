"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import {
    Check,
    CheckCheck,
    Clock,
    AlertCircle,
    FileText,
    Image as ImageIcon,
    UserPlus,
    XCircle,
    Bell,
    ChevronDown,
    ChevronLeft,
    MessageSquareText,
    Monitor,
    Smartphone,
    Radio,
    Webhook,
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
import { ReminderDialog } from "./reminder-dialog";
import type { Message, MessageStatus, MessageSource, CTWALog } from "@/lib/whatsapp/types";
import { SessionTimer } from "./session-timer";

const SOURCE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    webapp: {
        icon: <Monitor className="w-3 h-3" />,
        label: "CRM Webapp",
        color: "text-emerald-600",
    },
    mobile_app: {
        icon: <Smartphone className="w-3 h-3" />,
        label: "WhatsApp Mobile App",
        color: "text-blue-600",
    },
    api: {
        icon: <Webhook className="w-3 h-3" />,
        label: "External API",
        color: "text-purple-600",
    },
    broadcast: {
        icon: <Radio className="w-3 h-3" />,
        label: "Broadcast Campaign",
        color: "text-orange-600",
    },
    ctwa: {
        icon: <Megaphone className="w-3 h-3" />,
        label: "Click-to-WhatsApp Ad",
        color: "text-green-600",
    },
};

function SourceIcon({ source }: { source?: MessageSource }) {
    if (!source || source === "customer") return null;
    const config = SOURCE_CONFIG[source];
    if (!config) return null;
    return (
        <span title={config.label} className={`inline-flex items-center ${config.color}`}>
            {config.icon}
        </span>
    );
}

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

function StatusIcon({ status, failureReason }: { status: MessageStatus; failureReason?: string }) {
    switch (status) {
        case "sending":
            return <Clock className="w-3.5 h-3.5 text-slate-400" />;
        case "sent":
            return <Check className="w-3.5 h-3.5 text-slate-400" />;
        case "delivered":
            return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
        case "read":
            return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />;
        case "failed":
            return <span title={failureReason || "Delivery failed — check MSG91/Meta dashboard or server logs"}><AlertCircle className="w-3.5 h-3.5 text-red-500" /></span>;
        default:
            return null;
    }
}

// Parse message body: extract display text, media URL, and media type from
// various formats (plain text, JSON with attachment_url/caption, JSON with location, etc.)
function parseMessageBody(body: string, mediaUrl?: string, contentType?: string): {
    displayText: string;
    imageUrl?: string;
    documentUrl?: string;
} {
    const result: { displayText: string; imageUrl?: string; documentUrl?: string } = {
        displayText: body || "",
    };

    // If there's already a media_url from the DB, use it
    if (mediaUrl) {
        if (contentType === "image") {
            result.imageUrl = mediaUrl;
        } else if (contentType === "document") {
            result.documentUrl = mediaUrl;
        }
    }

    // Try to parse JSON body for MSG91 media messages
    if (body && body.startsWith("{")) {
        try {
            const parsed = JSON.parse(body);

            // Format: {"attachment_url":"https://...","caption":"..."}
            if (parsed.attachment_url) {
                const url = parsed.attachment_url as string;
                result.displayText = parsed.caption || parsed.text || "";
                if (url.match(/\.(pdf|doc|docx|xls|xlsx)$/i)) {
                    result.documentUrl = url;
                } else {
                    result.imageUrl = url;
                }
                return result;
            }

            // Format: {"text":"message text","location":{...}}
            if (parsed.text && !parsed.attachment_url) {
                result.displayText = parsed.text;
            }

            // Format: {"url":"https://...","caption":"..."}
            if (parsed.url && typeof parsed.url === "string" && !parsed.location && !parsed.contacts) {
                result.displayText = parsed.caption || parsed.text || "";
                if (parsed.url.match(/\.(jpg|jpeg|png|gif|webp)/i) || parsed.type === "image") {
                    result.imageUrl = parsed.url;
                } else {
                    result.documentUrl = parsed.url;
                }
                return result;
            }
        } catch {
            // Not JSON, use as-is
        }
    }

    return result;
}

// Format WhatsApp-style text: *bold*, _italic_, ~strikethrough~
function formatWhatsAppText(text: string): React.ReactNode[] {
    if (!text) return [];
    const parts: React.ReactNode[] = [];
    const regex = /(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        const fullMatch = match[0];
        const inner = fullMatch.slice(1, -1);
        if (fullMatch.startsWith("*")) {
            parts.push(<strong key={match.index}>{inner}</strong>);
        } else if (fullMatch.startsWith("_")) {
            parts.push(<em key={match.index}>{inner}</em>);
        } else if (fullMatch.startsWith("~")) {
            parts.push(<s key={match.index}>{inner}</s>);
        }
        lastIndex = match.index + fullMatch.length;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts.length > 0 ? parts : [text];
}

function MessageBubble({ message }: { message: Message }) {
    const isOutbound = message.direction === "outbound";
    const isNote = message.isInternalNote;
    const time = new Date(message.timestamp).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });

    // Parse message body to extract display text and media
    const { displayText, imageUrl, documentUrl } = parseMessageBody(
        message.body,
        message.mediaUrl,
        message.contentType
    );

    // Determine the image to show
    const showImage = imageUrl || (message.contentType === "image" && message.mediaUrl);

    return (
        <div
            className={cn(
                "flex w-full mb-2",
                isOutbound ? "justify-end ml-auto" : "justify-start"
            )}
            style={{ justifyContent: isOutbound ? "flex-end" : "flex-start" }}
        >
            <div
                className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm relative",
                    isNote
                        ? "bg-amber-50 border border-amber-200"
                        : isOutbound
                            ? "bg-[#dcf8c6] text-slate-900 rounded-br-md"
                            : "bg-white border border-slate-200 text-slate-900 rounded-bl-md"
                )}
            >
                {isNote && (
                    <span className="text-[10px] font-semibold uppercase text-amber-600 block mb-1">
                        Internal Note
                    </span>
                )}

                {/* Image content (from mediaUrl, parsed JSON, or attachment_url) */}
                {showImage && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-slate-200/50">
                        <a href={showImage} target="_blank" rel="noopener noreferrer">
                            <img
                                src={showImage}
                                alt="media"
                                className="w-full h-auto max-h-60 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                }}
                            />
                        </a>
                    </div>
                )}

                {/* Document content */}
                {(message.contentType === "document" || documentUrl) && !showImage && (
                    <div
                        className={cn(
                            "flex items-center gap-2 mb-2 p-2 rounded-lg",
                            isOutbound ? "bg-black/5" : "bg-slate-50"
                        )}
                    >
                        <FileText className="w-5 h-5 flex-shrink-0" />
                        {documentUrl ? (
                            <a
                                href={documentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm truncate text-blue-600 hover:underline"
                            >
                                {message.fileName || "Download Document"}
                            </a>
                        ) : (
                            <span className="text-sm truncate">
                                {message.fileName || "Document"}
                            </span>
                        )}
                    </div>
                )}

                {message.contentType === "interactive" && (
                    <div
                        className={cn(
                            "flex items-center gap-2 mb-2 p-2 rounded-lg",
                            isOutbound ? "bg-black/5 text-slate-800" : "bg-indigo-50 border border-indigo-100 text-indigo-700"
                        )}
                    >
                        <MessageSquareText className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-medium">Interactive Message</span>
                    </div>
                )}

                {message.contentType === "location" && (
                    <div
                        className={cn(
                            "flex flex-col gap-1 mb-2 p-2 rounded-lg",
                            isOutbound ? "bg-black/5 text-slate-800" : "bg-slate-50 text-slate-800"
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                            <span className="text-sm font-semibold">Location Shared</span>
                        </div>
                        {(() => {
                            try {
                                if (!isOutbound) {
                                    const parsed = JSON.parse(message.body);
                                    if (parsed.location?.latitude && parsed.location?.longitude) {
                                        return (
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${parsed.location.latitude},${parsed.location.longitude}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-600 hover:underline mt-1 break-all"
                                            >
                                                View on Google Maps
                                            </a>
                                        );
                                    }
                                }
                            } catch (e) {
                                // Ignore JSON parse errors
                            }
                            return null;
                        })()}
                    </div>
                )}

                {message.contentType === "contact" && (
                    <div
                        className={cn(
                            "flex flex-col gap-1 mb-2 p-2 rounded-lg",
                            isOutbound ? "bg-black/5 text-slate-800" : "bg-slate-50 text-slate-800"
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            <span className="text-sm font-semibold">Contact Card</span>
                        </div>
                        {(() => {
                            try {
                                if (!isOutbound) {
                                    const parsed = JSON.parse(message.body);
                                    if (parsed.contacts?.[0]?.name?.formatted_name) {
                                        return (
                                            <div className="text-xs mt-1 bg-white/50 px-2 py-1 rounded border border-black/5">
                                                <p className="font-medium">{parsed.contacts[0].name.formatted_name}</p>
                                                {parsed.contacts[0].phones?.[0]?.phone && (
                                                    <p className="text-slate-600 mt-0.5">{parsed.contacts[0].phones[0].phone}</p>
                                                )}
                                            </div>
                                        );
                                    }
                                }
                            } catch (e) {
                                // Ignore
                            }
                            return null;
                        })()}
                    </div>
                )}

                {(message.contentType as string) === "voice_call" && (
                    <div
                        className={cn(
                            "flex items-center gap-2 mb-2 p-2 rounded-lg",
                            isOutbound ? "bg-black/5 text-slate-800" : "bg-blue-50 border border-blue-100 text-blue-700"
                        )}
                    >
                        <PhoneIcon className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-medium">Voice call initiated</span>
                    </div>
                )}

                {/* Message text body (parsed from JSON if needed) */}
                {displayText && (
                    <p
                        className={cn(
                            "text-sm leading-relaxed whitespace-pre-wrap",
                            isNote
                                ? "text-amber-900"
                                : "text-slate-800"
                        )}
                    >
                        {formatWhatsAppText(displayText)}
                    </p>
                )}

                <div
                    className={cn(
                        "flex items-center justify-end gap-1 mt-1",
                        isNote
                            ? "text-amber-500"
                            : isOutbound
                                ? "text-emerald-700/70"
                                : "text-slate-400"
                    )}
                >
                    {isOutbound && !isNote && <SourceIcon source={message.source} />}
                    <span className="text-[10px]">{time}</span>
                    {isOutbound && !isNote && <StatusIcon status={message.status} failureReason={message.failureReason} />}
                </div>
            </div>
        </div>
    );
}

function formatDateSeparator(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (msgDay.getTime() === today.getTime()) return "Today";
    if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";

    // Same year → "5 March", different year → "5 March 2025"
    const options: Intl.DateTimeFormatOptions =
        date.getFullYear() === now.getFullYear()
            ? { day: "numeric", month: "long" }
            : { day: "numeric", month: "long", year: "numeric" };

    return date.toLocaleDateString("en-IN", options);
}

export function ChatWindow({ className }: { className?: string }) {
    const { activeConversationId, setActiveConversation } = useAppStore();
    const toggleContactPanel = useAppStore((s) => s.toggleContactPanel);
    const { data: conversation, isLoading } = useConversation(
        activeConversationId
    );
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
    const isAdmin = currentUser?.role === "admin";
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
                <div className="space-y-1">
                    {conversation.messages.map((msg, index) => {
                        // WhatsApp-style date separator
                        const msgDate = new Date(msg.timestamp);
                        const prevMsg = index > 0 ? conversation.messages[index - 1] : null;
                        const prevDate = prevMsg ? new Date(prevMsg.timestamp) : null;
                        const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString();

                        return (
                            <div key={msg.id}>
                                {showDateSep && (
                                    <div className="flex items-center justify-center my-3">
                                        <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-500 shadow-sm">
                                            {formatDateSeparator(msgDate)}
                                        </span>
                                    </div>
                                )}
                                <MessageBubble message={msg} />
                            </div>
                        );
                    })}
                </div>
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

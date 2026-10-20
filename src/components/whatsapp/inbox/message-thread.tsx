"use client";

import {
    Check,
    CheckCheck,
    Clock,
    AlertCircle,
    FileText,
    MessageSquareText,
    Monitor,
    Smartphone,
    Radio,
    Webhook,
    Phone as PhoneIcon,
    Megaphone,
} from "lucide-react";
import { cn } from "@/lib/whatsapp/utils";
import type { Message, MessageStatus, MessageSource } from "@/lib/whatsapp/types";

const SOURCE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    webapp: {
        icon: <Monitor className="w-3 h-3" />,
        label: "CRM Webapp",
        // Source icons render only on the fixed light-green outbound bubble.
        // Use a dark hex (not text-emerald-*, which the .whatsapp-shell theme
        // layer remaps to light lavender in dark mode → invisible on green).
        color: "text-[#047857]",
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

            // MSG91 template echo stored raw: {"body_name":{"parameter_name":"name","text":"Dhivya"},…}
            // — every value carries MSG91's `parameter_name` marker (location/contact
            // JSON does not). Render the text params instead of the JSON (covers
            // legacy rows saved before the webhook started normalizing these).
            {
                const values = Object.values(parsed);
                if (
                    values.length > 0 &&
                    values.every((v) => v && typeof v === "object" && !Array.isArray(v) && "parameter_name" in (v as object))
                ) {
                    const texts = values
                        .map((v) => (v as { text?: unknown }).text)
                        .filter((t): t is string => typeof t === "string" && t.length > 0);
                    result.displayText = texts.length ? texts.join(" · ") : "[Template]";
                    return result;
                }
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
                            // Fixed light-green surface in both themes → pin text to a
                            // dark hex so the dark-mode .text-slate-* flip can't wash it out.
                            ? "bg-[#dcf8c6] text-[#111b21] rounded-br-md"
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
                            isOutbound ? "bg-black/5 text-[#111b21]" :"bg-indigo-50 border border-indigo-100 text-indigo-700"
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
                            isOutbound ? "bg-black/5 text-[#111b21]" :"bg-slate-50 text-slate-800"
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
                            isOutbound ? "bg-black/5 text-[#111b21]" :"bg-slate-50 text-slate-800"
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
                            isOutbound ? "bg-black/5 text-[#111b21]" :"bg-blue-50 border border-blue-100 text-blue-700"
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
                                : isOutbound
                                    ? "text-[#111b21]"
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
                                ? "text-[#54656f]"
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

export interface MessageThreadProps {
    messages: Message[];
    loadingOlder?: boolean;
    onLoadOlder?: () => void;
}

/** Pure render of a thread, oldest first. ChatWindow and Desk own scrolling and data. */
export function MessageThread({ messages, loadingOlder, onLoadOlder }: MessageThreadProps) {
    return (
        <div className="space-y-1">
            {onLoadOlder && (
                <div className="flex justify-center pb-2">
                    <button
                        type="button"
                        onClick={onLoadOlder}
                        disabled={loadingOlder}
                        className="px-3 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-60"
                    >
                        {loadingOlder ? "Loading…" : "Load older messages"}
                    </button>
                </div>
            )}
            {messages.map((msg, index) => {
                // WhatsApp-style date separator
                const msgDate = new Date(msg.timestamp);
                const prevMsg = index > 0 ? messages[index - 1] : null;
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
    );
}

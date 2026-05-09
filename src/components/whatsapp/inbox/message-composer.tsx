"use client";

import { useState, useRef, type FormEvent } from "react";
import {
    Send,
    Paperclip,
    StickyNote,
    AlertTriangle,
    FileText,
    Zap,
    X,
    Image as ImageIcon,
    MessageSquareText,
    IndianRupee,
    LayoutList,
    ShoppingBag,
    CreditCard,
} from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Textarea } from "@/components/whatsapp/ui/textarea";
import { Badge } from "@/components/whatsapp/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/whatsapp/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/whatsapp/ui/dropdown-menu";
import { cn, isSessionExpired } from "@/lib/whatsapp/utils";
import { useSendMessage, useQuickReplies } from "@/lib/whatsapp/hooks";
import type { QuickReply } from "@/lib/whatsapp/types";
import { useAppStore } from "@/lib/whatsapp/store";
import { TemplatePickerDialog } from "./template-picker-dialog";
import { InteractiveMessageDialog } from "./interactive-message-dialog";
import { LocationMessageDialog } from "./location-message-dialog";
import { ContactMessageDialog } from "./contact-message-dialog";
import { ListMessageDialog } from "./list-message-dialog";
import { CatalogMessageDialog } from "./catalog-message-dialog";
import { WaPaymentDialog } from "./wa-payment-dialog";
import { PaymentLinkDialog } from "../payments/payment-link-dialog";
import { getContactDisplayName } from "@/lib/whatsapp/utils";
import type { Conversation } from "@/lib/whatsapp/types";

interface MessageComposerProps {
    conversation: Conversation;
}

export function MessageComposer({ conversation }: MessageComposerProps) {
    const [text, setText] = useState("");
    const [isInternalNote, setIsInternalNote] = useState(false);
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [interactiveDialogOpen, setInteractiveDialogOpen] = useState(false);
    const [locationDialogOpen, setLocationDialogOpen] = useState(false);
    const [contactDialogOpen, setContactDialogOpen] = useState(false);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [listDialogOpen, setListDialogOpen] = useState(false);
    const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
    const [waPaymentDialogOpen, setWaPaymentDialogOpen] = useState(false);
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sendMessage = useSendMessage();
    const { data: quickReplies } = useQuickReplies();
    const activeNumber = useAppStore((s) => s.activeNumber);

    const sessionExpired = isSessionExpired(conversation.lastIncomingTimestamp);

    // Filter quick replies by /shortcut
    const isSlashMode = text.startsWith("/") && text.length > 1;
    const slashFilter = isSlashMode ? text.slice(1).toLowerCase() : "";
    const filteredQuickReplies = (quickReplies || []).filter((qr: QuickReply) => {
        if (isSlashMode) {
            return (
                qr.shortcut?.toLowerCase().includes(slashFilter) ||
                qr.title.toLowerCase().includes(slashFilter)
            );
        }
        return true;
    });

    const handleSelectQuickReply = (qr: QuickReply) => {
        setText(qr.body);
        setShowQuickReplies(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAttachedFile(file);
        }
        // Reset input so the same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSend = (e: FormEvent) => {
        e.preventDefault();
        const hasText = text.trim().length > 0;
        const hasFile = attachedFile !== null;

        if ((!hasText && !hasFile) || (sessionExpired && !isInternalNote)) return;

        if (isInternalNote) {
            setText("");
            return;
        }

        if (hasFile) {
            const isImage = attachedFile!.type.startsWith("image/");
            const contentType = isImage ? "image" : "document";

            sendMessage.mutate({
                to: conversation.contact.phone,
                contentType,
                text: attachedFile!.name,
                conversationId: conversation.id,
                integratedNumber: activeNumber?.number || conversation.integratedNumber,
            } as Parameters<typeof sendMessage.mutate>[0]);
            setAttachedFile(null);
            setText("");
        } else {
            sendMessage.mutate({
                to: conversation.contact.phone,
                contentType: "text",
                text: text.trim(),
                conversationId: conversation.id,
                integratedNumber: activeNumber?.number || conversation.integratedNumber,
            });
            setText("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend(e);
        }
    };

    return (
        <>
            <div
                className={cn(
                    "border-t border-slate-200 bg-white px-4 py-3",
                    isInternalNote && "bg-amber-50/50"
                )}
            >
                {/* Session Expired Warning */}
                {sessionExpired && !isInternalNote && (
                    <div className="flex items-center gap-3 px-4 py-3 mb-3 rounded-xl bg-amber-50 border border-amber-200">
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-amber-800">
                                Session Expired
                            </p>
                            <p className="text-xs text-amber-600 mt-0.5">
                                The 24-hour window has passed. You can only send pre-approved templates.
                            </p>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTemplateDialogOpen(true)}
                            className="flex-shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 text-xs h-8"
                        >
                            <FileText className="w-3.5 h-3.5 mr-1.5" />
                            Send Template
                        </Button>
                    </div>
                )}

                {/* Internal Note Toggle */}
                <div className="flex items-center gap-2 mb-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant={isInternalNote ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setIsInternalNote(!isInternalNote)}
                                className={cn(
                                    "h-7 text-xs gap-1.5",
                                    isInternalNote
                                        ? "bg-amber-500 hover:bg-amber-600 text-white"
                                        : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                <StickyNote className="w-3.5 h-3.5" />
                                {isInternalNote ? "Writing Note" : "Note"}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            Internal notes are NOT sent to the customer
                        </TooltipContent>
                    </Tooltip>

                    {isInternalNote && (
                        <Badge
                            variant="secondary"
                            className="bg-amber-100 text-amber-700 text-[10px] h-5"
                        >
                            Only visible to your team
                        </Badge>
                    )}
                </div>

                {/* Attached File Preview */}
                {attachedFile && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                        {attachedFile.type.startsWith("image/") ? (
                            <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        ) : (
                            <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        )}
                        <span className="text-xs text-slate-700 truncate flex-1">
                            {attachedFile.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                            {(attachedFile.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                            onClick={() => setAttachedFile(null)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Composer */}
                <form onSubmit={handleSend} className="flex items-end gap-2">
                    <div className="flex-1 relative">
                        <Textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                sessionExpired && !isInternalNote
                                    ? "Session expired — use a template or write a note"
                                    : isInternalNote
                                        ? "Write an internal note..."
                                        : attachedFile
                                            ? "Add a caption (optional)..."
                                            : "Type a message..."
                            }
                            disabled={sessionExpired && !isInternalNote}
                            className={cn(
                                "min-h-[44px] max-h-[120px] resize-none text-sm pr-10",
                                isInternalNote && "border-amber-200 bg-amber-50/50",
                                sessionExpired &&
                                !isInternalNote &&
                                "opacity-60 cursor-not-allowed"
                            )}
                            rows={1}
                        />
                    </div>

                    <div className="flex items-center gap-1.5 pb-0.5">
                        {/* Hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                            onChange={handleFileSelect}
                        />

                        {!sessionExpired && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="h-9 w-9 text-slate-400 hover:text-slate-600"
                                    >
                                        <Paperclip className="w-4.5 h-4.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Attach file</TooltipContent>
                            </Tooltip>
                        )}

                        {!sessionExpired && (
                            <div className="relative">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setShowQuickReplies(!showQuickReplies)}
                                            className="h-9 w-9 text-slate-400 hover:text-amber-500"
                                        >
                                            <Zap className="w-4.5 h-4.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Quick replies</TooltipContent>
                                </Tooltip>

                                {(showQuickReplies || isSlashMode) && filteredQuickReplies.length > 0 && (
                                    <div className="absolute bottom-full mb-2 right-0 w-64 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-48 overflow-y-auto">
                                        {filteredQuickReplies.map((qr: QuickReply) => (
                                            <button
                                                key={qr.id}
                                                type="button"
                                                onClick={() => handleSelectQuickReply(qr)}
                                                className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-50 last:border-0"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-slate-800">{qr.title}</span>
                                                    {qr.shortcut && (
                                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 rounded">/{qr.shortcut}</span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-slate-500 truncate mt-0.5">{qr.body}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {!sessionExpired && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setTemplateDialogOpen(true)}
                                        className="h-9 w-9 text-slate-400 hover:text-slate-600"
                                    >
                                        <FileText className="w-4.5 h-4.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send template</TooltipContent>
                            </Tooltip>
                        )}

                        {!sessionExpired && !isInternalNote && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setInteractiveDialogOpen(true)}
                                        className="h-9 w-9 text-slate-400 hover:text-indigo-500"
                                    >
                                        <MessageSquareText className="w-4.5 h-4.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Add Buttons / Interactive Message</TooltipContent>
                            </Tooltip>
                        )}

                        {!sessionExpired && !isInternalNote && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setListDialogOpen(true)}
                                        className="h-9 w-9 text-slate-400 hover:text-indigo-500"
                                    >
                                        <LayoutList className="w-4.5 h-4.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send List Message</TooltipContent>
                            </Tooltip>
                        )}

                        {!sessionExpired && !isInternalNote && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setCatalogDialogOpen(true)}
                                        className="h-9 w-9 text-slate-400 hover:text-emerald-500"
                                    >
                                        <ShoppingBag className="w-4.5 h-4.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send Product Catalog</TooltipContent>
                            </Tooltip>
                        )}

                        {!sessionExpired && !isInternalNote && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setLocationDialogOpen(true)}
                                        className="h-9 w-9 text-slate-400 hover:text-indigo-500"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Share Location</TooltipContent>
                            </Tooltip>
                        )}

                        {!sessionExpired && !isInternalNote && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setContactDialogOpen(true)}
                                        className="h-9 w-9 text-slate-400 hover:text-indigo-500"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Share Contact (vCard)</TooltipContent>
                            </Tooltip>
                        )}

                        {!isInternalNote && (
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-slate-400 hover:text-emerald-600"
                                            >
                                                <IndianRupee className="w-4.5 h-4.5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent>Payment Options</TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => setPaymentDialogOpen(true)}>
                                        <IndianRupee className="w-4 h-4 mr-2" />
                                        Razorpay Link
                                    </DropdownMenuItem>
                                    {!sessionExpired && (
                                        <DropdownMenuItem onClick={() => setWaPaymentDialogOpen(true)}>
                                            <CreditCard className="w-4 h-4 mr-2" />
                                            WA Payment
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        <Button
                            type="submit"
                            size="icon"
                            disabled={
                                (!text.trim() && !attachedFile) || (sessionExpired && !isInternalNote) || sendMessage.isPending
                            }
                            className={cn(
                                "h-9 w-9 rounded-lg",
                                isInternalNote
                                    ? "bg-amber-500 hover:bg-amber-600"
                                    : "bg-emerald-500 hover:bg-emerald-600"
                            )}
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </form>
            </div>

            {/* Template Picker Dialog */}
            <TemplatePickerDialog
                open={templateDialogOpen}
                onOpenChange={setTemplateDialogOpen}
                conversation={conversation}
            />

            {/* Interactive Message Dialog */}
            <InteractiveMessageDialog
                open={interactiveDialogOpen}
                onOpenChange={setInteractiveDialogOpen}
                conversation={conversation}
                initialText={text}
                onSent={() => setText("")}
            />

            {/* Location Message Dialog */}
            <LocationMessageDialog
                open={locationDialogOpen}
                onOpenChange={setLocationDialogOpen}
                conversation={conversation}
                onSent={() => { }}
            />

            {/* Contact Message Dialog */}
            <ContactMessageDialog
                open={contactDialogOpen}
                onOpenChange={setContactDialogOpen}
                conversation={conversation}
                onSent={() => { }}
            />

            {/* List Message Dialog */}
            <ListMessageDialog
                open={listDialogOpen}
                onOpenChange={setListDialogOpen}
                conversation={conversation}
                onSent={() => { }}
            />

            {/* Catalog Message Dialog */}
            <CatalogMessageDialog
                open={catalogDialogOpen}
                onOpenChange={setCatalogDialogOpen}
                conversation={conversation}
                onSent={() => { }}
            />

            {/* Payment Link Dialog */}
            <PaymentLinkDialog
                open={paymentDialogOpen}
                onOpenChange={setPaymentDialogOpen}
                conversationId={conversation.id}
                contactId={conversation.contact.id}
                contactName={getContactDisplayName(conversation.contact)}
                phone={conversation.contact.phone}
            />

            {/* WA Payment Dialog */}
            <WaPaymentDialog
                open={waPaymentDialogOpen}
                onOpenChange={setWaPaymentDialogOpen}
                conversation={conversation}
                onSent={() => { }}
            />
        </>
    );
}

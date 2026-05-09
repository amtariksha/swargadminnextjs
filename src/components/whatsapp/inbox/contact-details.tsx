"use client";

import { useState } from "react";
import { Mail, Phone, Tag, Plus, X, User, Pencil, Check, Trash2, Megaphone } from "lucide-react";
import { Input } from "@/components/whatsapp/ui/input";
import { Button } from "@/components/whatsapp/ui/button";
import { Badge } from "@/components/whatsapp/ui/badge";
import { Separator } from "@/components/whatsapp/ui/separator";
import { Avatar, AvatarFallback } from "@/components/whatsapp/ui/avatar";
import { cn, getContactDisplayName, getContactInitials } from "@/lib/whatsapp/utils";
import { useConversation, useUpdateContactTags, useUpdateContact } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";

export function ContactDetails({ className }: { className?: string }) {
    const {
        activeConversationId,
        contactPanelOpen,
        setContactPanelOpen,
    } = useAppStore();
    const { data: conversation } = useConversation(activeConversationId);
    const updateTags = useUpdateContactTags();
    const updateContact = useUpdateContact();

    // Local state
    const [newTag, setNewTag] = useState("");
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState("");

    // Custom fields state
    const [newFieldKey, setNewFieldKey] = useState("");
    const [newFieldValue, setNewFieldValue] = useState("");
    const [showAddCustomField, setShowAddCustomField] = useState(false);

    if (!contactPanelOpen || !conversation) return null;

    const contact = conversation.contact;
    const displayName = getContactDisplayName(contact);
    const initials = getContactInitials(contact);

    // ─── Tags Handlers ─────────────────────────────────────
    const handleAddTag = () => {
        if (!newTag.trim()) return;
        const updatedTags = [...contact.tags, newTag.trim()];
        updateTags.mutate({ id: contact.id, tags: updatedTags });
        setNewTag("");
    };

    const handleRemoveTag = (tag: string) => {
        const updatedTags = contact.tags.filter((t) => t !== tag);
        updateTags.mutate({ id: contact.id, tags: updatedTags });
    };

    // ─── Name Handlers ─────────────────────────────────────
    const startEditingName = () => {
        setEditedName(contact.name);
        setIsEditingName(true);
    };

    const saveName = () => {
        if (!editedName.trim() || editedName === contact.name) {
            setIsEditingName(false);
            return;
        }
        updateContact.mutate({ id: contact.id, payload: { name: editedName } });
        setIsEditingName(false);
    };

    // ─── Custom Fields Handlers ────────────────────────────
    const handleAddCustomField = () => {
        if (!newFieldKey.trim() || !newFieldValue.trim()) return;

        const updatedFields = {
            ...(contact.customFields || {}),
            [newFieldKey.trim()]: newFieldValue.trim()
        };

        updateContact.mutate({
            id: contact.id,
            payload: { customFields: updatedFields }
        });

        setNewFieldKey("");
        setNewFieldValue("");
        setShowAddCustomField(false);
    };

    const handleDeleteCustomField = (key: string) => {
        const updatedFields = { ...(contact.customFields || {}) };
        delete updatedFields[key];

        updateContact.mutate({
            id: contact.id,
            payload: { customFields: updatedFields }
        });
    };

    return (
        <div className={cn("w-[300px] min-w-[300px] h-full border-l border-slate-200 bg-white flex flex-col overflow-y-auto", className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-slate-200 flex-shrink-0">
                <h3 className="text-sm font-semibold text-slate-900">
                    Contact Details
                </h3>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setContactPanelOpen(false)}
                    className="h-7 w-7 text-slate-400"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Profile */}
            <div className="flex flex-col items-center py-6 px-4">
                <Avatar className="w-16 h-16 mb-3">
                    <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xl font-semibold">
                        {initials}
                    </AvatarFallback>
                </Avatar>

                {isEditingName ? (
                    <div className="flex items-center gap-2 w-full">
                        <Input
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveName()}
                            className="text-center h-8 font-semibold"
                            autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={saveName}>
                            <Check className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setIsEditingName(false)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 group relative">
                        <h4 className="text-base font-semibold text-slate-900 text-center">
                            {displayName}
                        </h4>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity absolute -right-8"
                            onClick={startEditingName}
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                )}

                <p className="text-xs text-slate-500 mt-0.5">
                    Customer since{" "}
                    {new Date(contact.createdAt).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                    })}
                </p>
            </div>

            <Separator />

            {/* Contact Info */}
            <div className="px-4 py-4 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50">
                        <Phone className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                            Phone
                        </p>
                        <p className="text-sm text-slate-800">+{contact.phone}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-50">
                        <Mail className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                            Email
                        </p>
                        <p className="text-sm text-slate-800">
                            {contact.email || "Not provided"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50">
                        <User className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                            WhatsApp Number
                        </p>
                        <p className="text-sm text-slate-800">
                            +{conversation.integratedNumber}
                        </p>
                    </div>
                </div>

                {conversation.source === "ctwa" && (
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50">
                            <Megaphone className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                                Source
                            </p>
                            <p className="text-sm text-green-700 font-medium">
                                WhatsApp Ad
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <Separator />

            {/* Custom Fields */}
            <div className="px-4 py-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                        Additional Details
                    </h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-slate-500 hover:text-emerald-600 px-2"
                        onClick={() => setShowAddCustomField(true)}
                    >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add
                    </Button>
                </div>

                <div className="space-y-2">
                    {contact.customFields && Object.entries(contact.customFields).map(([key, value]) => (
                        <div key={key} className="group flex items-start justify-between text-sm border border-slate-100 rounded-md p-2 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] text-slate-500 font-medium mb-0.5">{key}</p>
                                <p className="text-slate-800 break-words">{value}</p>
                            </div>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDeleteCustomField(key)}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    ))}

                    {(!contact.customFields || Object.keys(contact.customFields).length === 0) && !showAddCustomField && (
                        <p className="text-xs text-slate-400 italic">No custom fields</p>
                    )}
                </div>

                {/* Add Custom Field Form */}
                {showAddCustomField && (
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                        <Input
                            placeholder="Field Name"
                            value={newFieldKey}
                            onChange={(e) => setNewFieldKey(e.target.value)}
                            className="h-7 text-xs bg-white"
                            autoFocus
                        />
                        <Input
                            placeholder="Value"
                            value={newFieldValue}
                            onChange={(e) => setNewFieldValue(e.target.value)}
                            className="h-7 text-xs bg-white"
                        />
                        <div className="flex items-center gap-2 pt-1">
                            <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 w-full"
                                onClick={handleAddCustomField}
                                disabled={!newFieldKey.trim() || !newFieldValue.trim()}
                            >
                                Add Field
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-slate-500 w-full"
                                onClick={() => setShowAddCustomField(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <Separator />

            {/* Tags */}
            <div className="px-4 py-4 flex-1">
                <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-4 h-4 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-700">Tags</p>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                    {contact.tags.map((tag) => (
                        <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs h-6 bg-slate-50 border border-slate-200 hover:bg-slate-100 gap-1 pr-1"
                        >
                            {tag}
                            <button
                                onClick={() => handleRemoveTag(tag)}
                                className="ml-0.5 hover:text-red-500 transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </Badge>
                    ))}
                    {contact.tags.length === 0 && (
                        <p className="text-xs text-slate-400">No tags yet</p>
                    )}
                </div>

                {/* Add Tag */}
                <div className="flex items-center gap-1.5">
                    <Input
                        placeholder="Add tag..."
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddTag();
                        }}
                        className="h-8 text-xs flex-1"
                    />
                    <Button
                        size="icon"
                        variant="outline"
                        onClick={handleAddTag}
                        disabled={!newTag.trim()}
                        className="h-8 w-8"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

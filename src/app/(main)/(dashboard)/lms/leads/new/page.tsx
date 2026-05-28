"use client";

/**
 * /lms/leads/new — manual lead entry form.
 *
 * Defaults to source='manual'. Auto-redirects to the lead's detail page
 * after successful creation. Surfaces dedupe outcomes inline so operators
 * see when their entry merged into an existing open lead.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
    UserPlus,
    Loader2,
    ArrowLeft,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { Lead, LeadSource } from "@/lib/lms/leads/types";

const SOURCE_OPTIONS: Array<{ value: LeadSource; label: string }> = [
    { value: "manual", label: "Manual entry" },
    { value: "phone", label: "Phone call" },
    { value: "stall", label: "Stall / event" },
    { value: "referral", label: "Referral" },
    { value: "social", label: "Social (Instagram / Facebook DM etc.)" },
    { value: "website_form", label: "Website form" },
    { value: "other", label: "Other" },
];

export default function NewLeadPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [pincode, setPincode] = useState("");
    const [source, setSource] = useState<LeadSource>("manual");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deduped, setDeduped] = useState<{ leadId: string } | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setDeduped(null);
        try {
            const res = await wfetch("/api/lms/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source,
                    name: name.trim() || undefined,
                    phone: phone.trim() || undefined,
                    email: email.trim() || undefined,
                    pincode: pincode.trim() || undefined,
                    notes: notes.trim() || undefined,
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const result = body as { lead: Lead; deduped: boolean };
            if (result.deduped) {
                setDeduped({ leadId: result.lead.id });
            } else {
                router.push(`/lms/leads/${result.lead.id}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <Link
                href="/lms/leads"
                className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to leads
            </Link>

            <div className="mb-6 flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                    <UserPlus className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        New lead
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Capture a fresh lead manually. If the phone matches an existing open
                        lead, we'll merge instead of duplicating.
                    </p>
                </div>
            </div>

            <form
                onSubmit={submit}
                className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
            >
                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                        <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                        {error}
                    </div>
                )}
                {deduped && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                        Phone number matches an existing open lead — merged into{" "}
                        <Link
                            href={`/lms/leads/${deduped.leadId}`}
                            className="font-semibold underline"
                        >
                            that record
                        </Link>{" "}
                        instead of creating a duplicate.
                    </div>
                )}

                <Field label="Name">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Anita Sharma"
                        maxLength={200}
                        className="input"
                    />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Phone">
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="9XXXXXXXXX"
                            maxLength={20}
                            className="input"
                        />
                    </Field>
                    <Field label="Email">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="anita@example.com"
                            maxLength={200}
                            className="input"
                        />
                    </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Pincode">
                        <input
                            type="text"
                            value={pincode}
                            onChange={(e) => setPincode(e.target.value)}
                            placeholder="560001"
                            maxLength={12}
                            className="input"
                        />
                    </Field>
                    <Field label="Source">
                        <select
                            value={source}
                            onChange={(e) => setSource(e.target.value as LeadSource)}
                            className="input"
                        >
                            {SOURCE_OPTIONS.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>

                <Field label="Notes">
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="What did they ask about? Any context the sales team should know?"
                        className="input"
                    />
                </Field>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Either phone or email is recommended for follow-up. Phone enables WhatsApp
                    + SMS channels; email enables newsletter / receipt flows.
                </p>

                <div className="flex gap-3 pt-2">
                    <Link
                        href="/lms/leads"
                        className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={saving || (!phone.trim() && !email.trim() && !name.trim())}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {saving ? "Creating…" : "Create lead"}
                    </button>
                </div>
            </form>

            <style jsx>{`
                .input {
                    width: 100%;
                    border-radius: 0.5rem;
                    border: 1px solid rgb(226 232 240);
                    background: white;
                    padding: 0.5rem 0.75rem;
                    font-size: 0.875rem;
                    outline: none;
                    color: rgb(15 23 42);
                }
                .input:focus {
                    border-color: transparent;
                    box-shadow: 0 0 0 2px rgb(168 85 247);
                }
                :global(html.dark) .input {
                    border-color: rgb(51 65 85);
                    background: rgb(15 23 42);
                    color: rgb(241 245 249);
                }
            `}</style>
        </div>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {label}
            </label>
            {children}
        </div>
    );
}

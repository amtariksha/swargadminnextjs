"use client";

import Link from "next/link";
import {
    Sparkles,
    ShieldCheck,
    Tags,
    UserPlus,
    Workflow,
    Megaphone,
    Inbox,
    Users,
    BarChart3,
    ArrowRight,
} from "lucide-react";

/**
 * LMS — Today screen (placeholder)
 *
 * Phase 1 scaffolding. Real Today screen ships in C9 with: headline numbers,
 * AI-flagged actions feed, live campaigns, calendar strip. For now, this is
 * a landing page that previews the modules under construction so the sidebar
 * link doesn't 404 and operators can see what's coming.
 *
 * Spec reference: /home/pradeep/Downloads/swarg-requirements.md §4.1.
 */

interface ModuleCard {
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
    phase: string;
    status: "scaffolding" | "active" | "coming";
}

const modules: ModuleCard[] = [
    {
        title: "People",
        description: "Unified customer + lead view with filters, tags, RFM, consent.",
        href: "/lms/people",
        icon: <Users className="w-5 h-5" />,
        phase: "C2 + C3",
        status: "coming",
    },
    {
        title: "Leads",
        description: "Capture, qualify, assign. Sources: WhatsApp, CTWA, manual, website, CSV.",
        href: "/lms/leads",
        icon: <UserPlus className="w-5 h-5" />,
        phase: "C4",
        status: "coming",
    },
    {
        title: "Segments",
        description: "Tag system + filter DSL. Natural language → DSL via Agent Force.",
        href: "/lms/segments",
        icon: <Tags className="w-5 h-5" />,
        phase: "C2",
        status: "coming",
    },
    {
        title: "Campaigns",
        description: "Multi-channel: WhatsApp + in-app + email. Compliance-Guard-checked.",
        href: "/lms/campaigns",
        icon: <Megaphone className="w-5 h-5" />,
        phase: "C5 + C8",
        status: "coming",
    },
    {
        title: "Journeys",
        description: "Pre-built: Welcome, Replenishment, Win-back, Festival, Referral.",
        href: "/lms/journeys",
        icon: <Workflow className="w-5 h-5" />,
        phase: "C6",
        status: "coming",
    },
    {
        title: "Inbox",
        description: "Omnichannel: WhatsApp x2 + email + web. Auto-triage via Agent Force.",
        href: "/lms/inbox",
        icon: <Inbox className="w-5 h-5" />,
        phase: "C8 + C9",
        status: "coming",
    },
    {
        title: "Privacy & Consent",
        description: "DPDP-compliant consent ledger, preference center, DSAR queue.",
        href: "/lms/settings/privacy",
        icon: <ShieldCheck className="w-5 h-5" />,
        phase: "C1 · foundation",
        status: "coming",
    },
];

export default function LmsTodayPage() {
    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            {/* Header */}
            <div className="mb-8 flex items-start gap-4">
                <div className="rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 p-3 shadow-lg shadow-purple-500/30">
                    <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                        LMS — Lead Management &amp; Marketing System
                    </h1>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                        Foundation layer under construction. Built per the requirements at
                        {" "}
                        <code className="rounded bg-slate-200/50 px-1.5 py-0.5 text-xs dark:bg-slate-800/50">
                            /home/pradeep/Downloads/swarg-requirements.md
                        </code>
                        . Modules will activate as each Phase 1 sub-phase ships.
                    </p>
                </div>
            </div>

            {/* Status notice */}
            <div className="mb-8 rounded-xl border border-amber-300/40 bg-amber-50/40 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <strong className="font-semibold">Phase 1 in progress.</strong>{" "}
                Schema migration <code>001_lms_schema.sql</code> ready to apply in
                Supabase Studio. C1 (consent ledger) ships next, then C2 → C10
                following the plan timeline.
            </div>

            {/* Module grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {modules.map((m) => (
                    <Link
                        key={m.href}
                        href={m.href}
                        className="group rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-purple-300 hover:shadow-md hover:shadow-purple-500/10 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-purple-500/50"
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors group-hover:bg-purple-100 group-hover:text-purple-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-purple-500/20 dark:group-hover:text-purple-300">
                                {m.icon}
                            </div>
                            <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                    m.status === "active"
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                        : m.status === "scaffolding"
                                          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                }`}
                            >
                                {m.status === "coming" ? m.phase : m.status}
                            </span>
                        </div>
                        <h3 className="mb-1 font-semibold text-slate-900 dark:text-slate-50">
                            {m.title}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            {m.description}
                        </p>
                        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-purple-400">
                            Open <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                    </Link>
                ))}
            </div>

            {/* Footer hint */}
            <div className="mt-8 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-500">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>
                    Today screen (full metrics + AI-flagged actions feed) ships in C9.
                </span>
            </div>
        </div>
    );
}

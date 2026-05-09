"use client";

import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/whatsapp/ui/tooltip";

/**
 * Wraps every /whatsapp/** route in TooltipProvider, which the WACRM-derived
 * UI primitives expect at the React tree root. Scoping it here (instead of in
 * the global app/layout.tsx) keeps the rest of the admin panel untouched and
 * avoids any chance of provider conflicts with existing Radix/Tooltip usage.
 *
 * Auth gating happens in the parent (dashboard)/layout.tsx; we don't repeat
 * it. Permission gating for the WhatsApp section happens in Sidebar.tsx via
 * the `whatsapp` permission key.
 */
export default function WhatsappSectionLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <TooltipProvider delayDuration={200}>
            <div className="-m-4 lg:-m-6 h-[calc(100vh-64px)] flex flex-col">
                {children}
            </div>
        </TooltipProvider>
    );
}

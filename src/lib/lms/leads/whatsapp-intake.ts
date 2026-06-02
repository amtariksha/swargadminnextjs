/**
 * WhatsApp → LMS lead intake (webhook hot path).
 *
 * Called from the Meta + MSG91 inbound webhooks right after the contact
 * upsert. Supabase-only by design — NO synchronous backend lookup — so it
 * stays cheap and never delays the 200 ack the providers require (a slow ack
 * makes MSG91 auto-pause the number).
 *
 *   • Already a known backend customer (lms_unified_customers has a
 *     backend_user_id for this phone) → do nothing.
 *   • Otherwise → createLead(source='whatsapp'). Idempotent: repeat messages
 *     just touch last_activity_at.
 *
 * Backend-user awareness for phones not yet in lms_unified_customers is
 * deferred to the nightly reconcile, which links them and flips any lead to
 * 'converted'. This function never throws — failures are logged and swallowed.
 */

import { createLead } from "@/lib/lms/leads/service";
import { lookupKnownCustomer } from "@/lib/lms/unified/service";

export async function maybeCreateWhatsAppLead(args: {
    phone: string;
    contactId: string;
    name?: string | null;
    channelSource?: string;
    ctwaClid?: string | null;
}): Promise<void> {
    const phone = args.phone?.trim();
    if (!phone) return;
    try {
        const known = await lookupKnownCustomer(phone);
        if (known) return; // existing customer — never mint a lead
        await createLead({
            source: "whatsapp",
            phone,
            name: args.name ?? undefined,
            contactId: args.contactId,
            sourceDetails: {
                channel_source:
                    args.channelSource ?? (args.ctwaClid ? "ctwa" : "organic"),
                ...(args.ctwaClid ? { ctwa_clid: args.ctwaClid } : {}),
                wa_first_message_at: new Date().toISOString(),
            },
        });
    } catch (err) {
        console.warn(
            "[lms] whatsapp lead intake failed (non-fatal):",
            err instanceof Error ? err.message : err,
        );
    }
}

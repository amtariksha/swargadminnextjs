// Staff push for genuine inbound customer messages: POSTs a compact payload to
// the Swarg Node backend, which fans it out to customer-care staff devices.
// Feature is OFF unless WA_INBOUND_NOTIFY_SECRET is set. Called from the
// MSG91/Meta webhook routes fire-and-forget — every failure is swallowed so a
// slow or dead notify endpoint can NEVER delay or break the webhook 200 ack.

const DEFAULT_NOTIFY_URL = "https://node.desicowmilk.com/api/whatsapp/notify_inbound";
const NOTIFY_TIMEOUT_MS = 3000;
const PREVIEW_MAX_CHARS = 140;

export interface StaffInboundPayload {
    contactName: string;
    phone: string;
    preview: string;
    conversationId: string;
    integratedNumber?: string;
}

export async function notifyStaffInbound(payload: StaffInboundPayload): Promise<void> {
    try {
        const secret = process.env.WA_INBOUND_NOTIFY_SECRET;
        if (!secret) return; // Feature off — no shared secret configured.

        const url = process.env.WA_INBOUND_NOTIFY_URL || DEFAULT_NOTIFY_URL;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
        try {
            await fetch(url, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-wa-notify-secret": secret,
                },
                body: JSON.stringify({
                    contact_name: payload.contactName,
                    phone: payload.phone,
                    preview: payload.preview.slice(0, PREVIEW_MAX_CHARS),
                    conversation_id: payload.conversationId,
                    integrated_number: payload.integratedNumber,
                }),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
    } catch (err) {
        // Best-effort only — log and move on, never throw into the webhook.
        console.warn("[staff-notify] Inbound push failed (ignored):", err);
    }
}

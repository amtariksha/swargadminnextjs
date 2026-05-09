/**
 * Facebook Conversions API (CAPI) helper
 * Sends conversion events (Lead, Purchase) back to Meta for ad attribution.
 */

import { getCTWASettings } from "@/lib/whatsapp/ctwa-settings";

interface ConversionEvent {
    eventName: "Lead" | "Purchase";
    ctwaClid: string;
    eventTime?: number; // Unix timestamp, defaults to now
}

/**
 * Send a conversion event to the Meta Conversions API.
 */
export async function sendConversionEvent(
    event: ConversionEvent,
    datasetId: string,
    accessToken: string
): Promise<{ success: boolean; error?: string }> {
    const { metaApiVersion } = await getCTWASettings();
    const payload = {
        data: [
            {
                event_name: event.eventName,
                event_time: event.eventTime || Math.floor(Date.now() / 1000),
                action_source: "business_messaging",
                messaging_channel: "whatsapp",
                user_data: {
                    ctwa_clid: event.ctwaClid,
                },
            },
        ],
    };

    try {
        console.log(
            `[CAPI] Sending ${event.eventName} event for ctwa_clid: ${event.ctwaClid} to dataset: ${datasetId}`
        );

        const response = await fetch(
            `https://graph.facebook.com/${metaApiVersion}/${datasetId}/events?access_token=${accessToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }
        );

        const data = await response.json();

        if (!response.ok || data.error) {
            const errMsg = data.error?.message || `HTTP ${response.status}`;
            console.error(`[CAPI] Error sending ${event.eventName}:`, errMsg);
            return { success: false, error: errMsg };
        }

        console.log(`[CAPI] ${event.eventName} event sent successfully. Events received: ${data.events_received || 0}`);
        return { success: true };
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Network error";
        console.error(`[CAPI] Network error sending ${event.eventName}:`, errMsg);
        return { success: false, error: errMsg };
    }
}

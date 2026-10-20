// Caller authentication for the two WhatsApp webhooks (P1d). proxy.ts lets /api/whatsapp/webhooks/
// through without a JWT, so each webhook checks its caller here.
//
//   MSG91  shared secret configured in the MSG91 panel (header x-swarg-webhook-secret, or query
//          parameter secret when the panel has no header field) and stored by the operator in
//          app_settings as msg91_webhook_secret. Blank setting = report-only: every call is
//          accepted and whether it carried a secret is logged at most every 10 minutes.
//   Meta   x-hub-signature-256 = "sha256=" + HMAC-SHA256(FACEBOOK_APP_SECRET, raw body). A wrong
//          signature is rejected (as before P1d); a missing header is reported, not rejected, while
//          META_SIGNATURE_HEADER_REQUIRED is false (R-D2).
//
// Comparisons are constant time. Nothing here logs a secret, its length, a prefix or the URL.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ORG_ID } from "./request";
import { getAppSetting } from "./settings";

export type AuthResult = "ok" | "no_secret" | "missing" | "mismatch";
export interface AuthVerdict { result: AuthResult; accept: boolean; carried: boolean }

export const MSG91_SECRET_SETTING = "msg91_webhook_secret";
export const MSG91_SECRET_HEADER = "x-swarg-webhook-secret";
export const MSG91_SECRET_QUERY = "secret";
/** R-D2: a missing x-hub-signature-256 is reported, not rejected, until a follow-up deploy flips this. */
export const META_SIGNATURE_HEADER_REQUIRED = false;

const META_SIGNATURE_HEADER = "x-hub-signature-256";
const SECRET_CACHE_MS = 60_000;
const LOG_THROTTLE_MS = 10 * 60_000;
const FAIL_OPEN: AuthVerdict = { result: "no_secret", accept: true, carried: false };

let cachedSecret: { value: string; expiresAt: number } | null = null;
let lastReportOnlyLogAt: number | null = null;
let lastMetaNoSecretLogAt: number | null = null;

/** Equal-length digests, so timingSafeEqual never throws and the length is not leaked. */
function sameText(a: string, b: string): boolean {
    const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
    return timingSafeEqual(digest(a), digest(b));
}

/** True at most once per LOG_THROTTLE_MS for a given "last logged" slot. */
function dueForLog(last: number | null, now: number): boolean {
    return last === null || now - last >= LOG_THROTTLE_MS;
}

/** Pure. Trims both sides. Constant-time (sha256 of each side, then timingSafeEqual). */
export function decideSharedSecret(configured: string, carried: string | null): AuthVerdict {
    const expected = configured.trim();
    const given = (carried ?? "").trim();
    if (expected === "") return { result: "no_secret", accept: true, carried: given !== "" };
    if (given === "") return { result: "missing", accept: false, carried: false };
    return sameText(expected, given)
        ? { result: "ok", accept: true, carried: true }
        : { result: "mismatch", accept: false, carried: true };
}

/** Pure. appSecret and header are compared exactly as today (no trim). */
export function decideMetaSignature(input: {
    appSecret: string; header: string | null; rawBody: string; requireHeader: boolean;
}): AuthVerdict {
    const present = input.header !== null && input.header !== "";
    if (input.appSecret === "") return { result: "no_secret", accept: true, carried: present };
    if (!present) return { result: "missing", accept: !input.requireHeader, carried: false };
    const expected = "sha256=" + createHmac("sha256", input.appSecret).update(input.rawBody).digest("hex");
    return sameText(expected, input.header ?? "")
        ? { result: "ok", accept: true, carried: true }
        : { result: "mismatch", accept: false, carried: true };
}

async function readMsg91Secret(): Promise<string> {
    const now = Date.now();
    if (cachedSecret !== null && cachedSecret.expiresAt > now) return cachedSecret.value;
    let value = "";
    try {
        value = await getAppSetting(MSG91_SECRET_SETTING, "", ORG_ID);
    } catch {
        // A failed read counts as "not set" (report-only), never as a reason to drop messages.
        value = "";
    }
    cachedSecret = { value: typeof value === "string" ? value : "", expiresAt: now + SECRET_CACHE_MS };
    return cachedSecret.value;
}

/** Reads the secret (cached 60 s per instance; any read error = blank) and the carrier. Never throws. */
export async function checkMsg91Secret(request: NextRequest): Promise<AuthVerdict> {
    try {
        const configured = await readMsg91Secret();
        const carried = request.headers.get(MSG91_SECRET_HEADER) ?? request.nextUrl.searchParams.get(MSG91_SECRET_QUERY);
        const verdict = decideSharedSecret(configured, carried);
        const now = Date.now();
        if (verdict.result === "no_secret" && dueForLog(lastReportOnlyLogAt, now)) {
            lastReportOnlyLogAt = now;
            console.log(
                `[MSG91 Webhook] auth=report-only (msg91_webhook_secret not set) carried_secret=${verdict.carried ? "yes" : "no"}`,
            );
        }
        return verdict;
    } catch {
        console.error("[MSG91 Webhook] auth check failed; accepting (report-only)");
        return FAIL_OPEN;
    }
}

/** process.env.FACEBOOK_APP_SECRET ?? ""; logs as before P1d (the "not set" warning throttled). Never throws. */
export async function checkMetaSignature(request: NextRequest, rawBody: string): Promise<AuthVerdict> {
    try {
        const verdict = decideMetaSignature({
            appSecret: process.env.FACEBOOK_APP_SECRET ?? "",
            header: request.headers.get(META_SIGNATURE_HEADER),
            rawBody,
            requireHeader: META_SIGNATURE_HEADER_REQUIRED,
        });
        const now = Date.now();
        if (verdict.result === "missing") {
            // Secret configured but Meta sent no signature header — suspicious.
            console.warn("[Meta Webhook] FACEBOOK_APP_SECRET set but request carried no x-hub-signature-256 header");
        } else if (verdict.result === "no_secret" && dueForLog(lastMetaNoSecretLogAt, now)) {
            lastMetaNoSecretLogAt = now;
            console.warn(
                "[Meta Webhook] SECURITY: FACEBOOK_APP_SECRET is not set — signature verification is DISABLED. " +
                "Set it in the deployment env to authenticate Meta webhook calls."
            );
        }
        return verdict;
    } catch {
        console.error("[Meta Webhook] signature check failed; accepting");
        return FAIL_OPEN;
    }
}

/** Tests only: drop the cached secret and the log throttles. */
export function clearWebhookAuthCache(): void {
    cachedSecret = null;
    lastReportOnlyLogAt = null;
    lastMetaNoSecretLogAt = null;
}

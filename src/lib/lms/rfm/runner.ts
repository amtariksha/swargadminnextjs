/**
 * RFM + Health-score job runner.
 *
 * Pipeline:
 *   1. Fetch all contacts in the org from Supabase (public.contacts).
 *   2. Fetch order data from the swargnodejsbackend for the last 180 days,
 *      forwarding the caller's admin Bearer JWT for auth.
 *   3. Aggregate orders per phone → (lastOrderDate, freq90d, monetary90d, ...).
 *   4. Compute R/F/M scores + segment for every contact (pure function).
 *   5. Compute health score + churn risk + next-best-action per contact.
 *   6. Bulk-upsert into app_lms.lms_rfm_scores + lms_health_scores.
 *   7. Return summary (counts, errors, last-computed-at).
 *
 * Backend integration is best-effort: if the /get_order call fails for any
 * reason (auth, network, schema change), we still write zero-RFM rows so the
 * segment evaluator has something to query against. The caller (UI) sees a
 * "backendOk:false" flag and can surface it.
 *
 * For local-dev and first-time testing, see /api/lms/rfm/seed-demo — it
 * fills in plausible random RFM rows without touching the backend.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import {
    computeRfmBatch,
    type RfmInput,
    type RfmOutput,
} from "@/lib/lms/rfm/score";
import { computeHealth, type HealthSignals } from "@/lib/lms/rfm/health";

const BACKEND_LOOKBACK_DAYS = 180;
const BATCH_UPSERT_SIZE = 200;

export interface RfmRunResult {
    contactCount: number;
    rowsWritten: number;
    backendOk: boolean;
    backendError?: string;
    computedAt: string;
    durationMs: number;
}

interface OrderAggregate {
    lastOrderAt: Date | null;
    count90d: number;
    sum90d: number;
    count180d: number;
    firstOrderAt: Date | null;
}

// ─── Public entrypoint ────────────────────────────────────────────────────

export async function runRfmRecompute(args: {
    /**
     * Admin Bearer JWT — forwarded to the swargnodejsbackend so its
     * `authenticateToken` middleware accepts the request. If omitted, the
     * backend call is skipped and everyone gets a zero-RFM row.
     */
    authToken?: string;
    /** Override the backend base URL (defaults to NEXT_PUBLIC_API_BASE_URL). */
    backendUrl?: string;
} = {}): Promise<RfmRunResult> {
    const startedAt = Date.now();
    const computedAt = new Date(startedAt).toISOString();

    const contacts = await fetchContacts();
    if (contacts.length === 0) {
        return {
            contactCount: 0,
            rowsWritten: 0,
            backendOk: true,
            computedAt,
            durationMs: Date.now() - startedAt,
        };
    }

    // Step 2 + 3: fetch + aggregate. Empty map on failure.
    let aggregates = new Map<string, OrderAggregate>();
    let backendOk = true;
    let backendError: string | undefined;
    if (args.authToken) {
        try {
            aggregates = await fetchOrderAggregates({
                authToken: args.authToken,
                backendUrl: args.backendUrl ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
                lookbackDays: BACKEND_LOOKBACK_DAYS,
            });
        } catch (err) {
            backendOk = false;
            backendError = err instanceof Error ? err.message : "Unknown error";
            console.warn("[rfm] backend order fetch failed — falling back to zeros:", backendError);
        }
    } else {
        backendOk = false;
        backendError = "No auth token provided; skipped backend fetch.";
    }

    // Step 4: compute R/F/M for every contact.
    const inputs: RfmInput[] = contacts.map((c) => {
        const agg = aggregates.get(c.phone);
        return {
            customerId: c.id,
            recencyDays: agg?.lastOrderAt
                ? daysBetween(agg.lastOrderAt, new Date())
                : 9999,
            frequencyCount: agg?.count90d ?? 0,
            monetaryValue: agg?.sum90d ?? 0,
        };
    });
    const rfmRows = computeRfmBatch(inputs);

    // Step 5: health score per contact, using available signals.
    const healthRows = rfmRows.map((r) => {
        const aggKey = contacts.find((c) => c.id === r.customerId)?.phone;
        const agg = aggKey ? aggregates.get(aggKey) : undefined;
        const signals: HealthSignals = {
            firstOrderAgeDays: agg?.firstOrderAt
                ? daysBetween(agg.firstOrderAt, new Date())
                : null,
            // Signals we don't have yet — engagement, opt-out, festival
            // calendar — will be wired up in C8 (Insights agent) and C6
            // (journeys). For now they're left null and the heuristic uses
            // RFM alone, which is the dominant signal anyway.
        };
        return { customerId: r.customerId, ...computeHealth(r, signals) };
    });

    // Step 6: bulk upsert (delete-then-insert for simplicity; small dataset).
    const rowsWritten = await writeRfmAndHealth({
        computedAt,
        rfm: rfmRows,
        health: healthRows.map((h) => ({
            customerId: h.customerId,
            score: h.score,
            churnRisk: h.churnRisk,
            nextBestAction: h.nextBestAction,
            reasonBlob: h.reasonBlob,
        })),
    });

    return {
        contactCount: contacts.length,
        rowsWritten,
        backendOk,
        backendError,
        computedAt,
        durationMs: Date.now() - startedAt,
    };
}

// ─── Step 1: contacts ─────────────────────────────────────────────────────

async function fetchContacts(): Promise<Array<{ id: string; phone: string }>> {
    const { data, error } = await supabaseAdmin
        .from("contacts")
        .select("id, phone")
        .not("phone", "is", null);
    if (error) throw new Error(`[rfm] fetchContacts failed: ${error.message}`);
    return (data ?? [])
        .map((r) => ({ id: r.id as string, phone: String(r.phone) }))
        .filter((c) => c.phone.length > 0);
}

// ─── Step 2: backend order fetch + Step 3: aggregate ───────────────────────

async function fetchOrderAggregates(args: {
    authToken: string;
    backendUrl: string;
    lookbackDays: number;
}): Promise<Map<string, OrderAggregate>> {
    if (!args.backendUrl) {
        throw new Error("backendUrl not configured (set NEXT_PUBLIC_API_BASE_URL)");
    }
    // Backend route: GET /get_order returns last 180 days by default. The
    // existing handler paginates only on `search`; without search it returns
    // the full window (lazy: assume it fits one response for now — Swarg is
    // small).
    const url = `${args.backendUrl.replace(/\/$/, "")}/get_order`;
    const res = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${args.authToken}`,
            "Content-Type": "application/json",
        },
    });
    if (!res.ok) {
        throw new Error(`backend ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
        response?: number;
        status?: boolean;
        data?: Array<Record<string, unknown>>;
    };
    if (json.response && json.response !== 200) {
        throw new Error(`backend non-200 envelope: response=${json.response}`);
    }
    const orders = json.data ?? [];

    const cutoff90 = Date.now() - args.lookbackDays * 24 * 60 * 60 * 1000;
    const cutoff90d = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const out = new Map<string, OrderAggregate>();

    for (const order of orders) {
        const phone = extractPhone(order);
        if (!phone) continue;
        const createdAt = extractDate(order);
        if (!createdAt) continue;
        if (createdAt.getTime() < cutoff90) continue; // outside lookback window
        const amount = extractAmount(order);

        const agg = out.get(phone) ?? {
            lastOrderAt: null,
            count90d: 0,
            sum90d: 0,
            count180d: 0,
            firstOrderAt: null,
        };
        if (!agg.lastOrderAt || createdAt > agg.lastOrderAt) agg.lastOrderAt = createdAt;
        if (!agg.firstOrderAt || createdAt < agg.firstOrderAt) agg.firstOrderAt = createdAt;
        agg.count180d += 1;
        if (createdAt.getTime() >= cutoff90d) {
            agg.count90d += 1;
            agg.sum90d += amount;
        }
        out.set(phone, agg);
    }
    return out;
}

function extractPhone(order: Record<string, unknown>): string | null {
    const candidates = [
        order.user_phone,
        order.phone,
        order.customer_phone,
        (order.user as Record<string, unknown> | undefined)?.phone,
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.trim().length > 0) {
            return c.replace(/^\+/, "").trim();
        }
        if (typeof c === "number") return String(c);
    }
    return null;
}

function extractDate(order: Record<string, unknown>): Date | null {
    const candidates = [order.created_at, order.order_date, order.placed_at];
    for (const c of candidates) {
        if (typeof c === "string") {
            const d = new Date(c);
            if (!Number.isNaN(d.getTime())) return d;
        }
    }
    return null;
}

function extractAmount(order: Record<string, unknown>): number {
    const candidates = [order.total_amount, order.amount, order.grand_total];
    for (const c of candidates) {
        if (typeof c === "number" && Number.isFinite(c)) return c;
        if (typeof c === "string") {
            const n = parseFloat(c);
            if (Number.isFinite(n)) return n;
        }
    }
    return 0;
}

// ─── Step 6: write to Supabase ────────────────────────────────────────────

async function writeRfmAndHealth(args: {
    computedAt: string;
    rfm: RfmOutput[];
    health: Array<{
        customerId: string;
        score: number;
        churnRisk: string;
        nextBestAction: string;
        reasonBlob: Record<string, unknown>;
    }>;
}): Promise<number> {
    // Upsert rather than truncate-and-insert so a partial failure leaves the
    // previous snapshot in place (the PK is customer_id on both tables).
    const rfmRows = args.rfm.map((r) => ({
        customer_id: r.customerId,
        recency_days: r.recencyDays,
        recency_score: r.recencyScore,
        frequency_count: r.frequencyCount,
        frequency_score: r.frequencyScore,
        monetary_value: r.monetaryValue,
        monetary_score: r.monetaryScore,
        segment: r.segment,
        computed_at: args.computedAt,
    }));
    const healthRows = args.health.map((h) => ({
        customer_id: h.customerId,
        score: h.score,
        churn_risk: h.churnRisk,
        next_best_action: h.nextBestAction,
        reason_blob: h.reasonBlob,
        computed_at: args.computedAt,
    }));

    let written = 0;
    for (let i = 0; i < rfmRows.length; i += BATCH_UPSERT_SIZE) {
        const slice = rfmRows.slice(i, i + BATCH_UPSERT_SIZE);
        const { error } = await lmsAdmin
            .from("lms_rfm_scores")
            .upsert(slice, { onConflict: "customer_id" });
        if (error) throw new Error(`[rfm] rfm upsert failed: ${error.message}`);
        written += slice.length;
    }
    for (let i = 0; i < healthRows.length; i += BATCH_UPSERT_SIZE) {
        const slice = healthRows.slice(i, i + BATCH_UPSERT_SIZE);
        const { error } = await lmsAdmin
            .from("lms_health_scores")
            .upsert(slice, { onConflict: "customer_id" });
        if (error) throw new Error(`[rfm] health upsert failed: ${error.message}`);
    }
    return written;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
    return Math.max(0, Math.floor(Math.abs(b.getTime() - a.getTime()) / 86_400_000));
}

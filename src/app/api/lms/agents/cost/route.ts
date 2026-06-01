/**
 * GET /api/lms/agents/cost
 *
 * Query params:
 *   from        ISO date — inclusive
 *   to          ISO date — exclusive
 *   groupBy     'agent' | 'conversation' | 'customer' | 'day' (default 'agent')
 *   limit       max rows per group (default 100, max 1000)
 *   format      'json' (default) | 'csv'
 *
 * Returns per-grouping cost rollup driven by app_lms.lms_agent_runs.
 * Owner ask: "I need clear report of how much is being spent conversation
 * wise so I can optimise the workflow" (no spend cap, observability only).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lmsAdmin } from "@/lib/lms/supabase";

type GroupBy = "agent" | "conversation" | "customer" | "day";

const schema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    groupBy: z.enum(["agent", "conversation", "customer", "day"]).default("agent"),
    limit: z.number().int().min(1).max(1000).default(100),
    format: z.enum(["json", "csv"]).default("json"),
});

interface RawRun {
    agent_slug: string;
    session_id: string;
    customer_id: string | null;
    conversation_id: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | string | null;
    latency_ms: number | null;
    succeeded: boolean;
    created_at: string;
}

export async function GET(request: NextRequest) {
    const sp = new URL(request.url).searchParams;
    const parsed = schema.safeParse({
        from: sp.get("from") ?? undefined,
        to: sp.get("to") ?? undefined,
        groupBy: sp.get("groupBy") ?? "agent",
        limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
        format: sp.get("format") ?? "json",
    });
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid query", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    const { from, to, groupBy, limit, format } = parsed.data;

    try {
        let q = lmsAdmin
            .from("lms_agent_runs")
            .select(
                "agent_slug, session_id, customer_id, conversation_id, input_tokens, output_tokens, cost_usd, latency_ms, succeeded, created_at",
            );
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lt("created_at", to);
        const { data, error } = await q;
        if (error) throw new Error(error.message);

        const rollup = rollupBy((data ?? []) as RawRun[], groupBy, limit);
        const totals = computeTotals((data ?? []) as RawRun[]);

        if (format === "csv") {
            const csv = rollupToCsv(rollup, groupBy);
            return new NextResponse(csv, {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="agent-cost-${groupBy}-${new Date().toISOString().slice(0, 10)}.csv"`,
                },
            });
        }

        return NextResponse.json({
            groupBy,
            from: from ?? null,
            to: to ?? null,
            totals,
            rows: rollup,
        });
    } catch (err) {
        console.error("[GET /api/lms/agents/cost]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

// ─── Rollup ────────────────────────────────────────────────────────────────

interface RollupRow {
    groupKey: string;
    runs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    avgLatencyMs: number;
    failureRate: number;
}

function rollupBy(runs: RawRun[], groupBy: GroupBy, limit: number): RollupRow[] {
    const map = new Map<string, RollupRow & { latencyTotal: number; failures: number }>();
    for (const r of runs) {
        const key = pickKey(r, groupBy);
        if (!key) continue;
        const cost = toNumber(r.cost_usd);
        const inTok = r.input_tokens ?? 0;
        const outTok = r.output_tokens ?? 0;
        const lat = r.latency_ms ?? 0;
        const existing = map.get(key);
        if (existing) {
            existing.runs += 1;
            existing.inputTokens += inTok;
            existing.outputTokens += outTok;
            existing.costUsd += cost;
            existing.latencyTotal += lat;
            if (!r.succeeded) existing.failures += 1;
        } else {
            map.set(key, {
                groupKey: key,
                runs: 1,
                inputTokens: inTok,
                outputTokens: outTok,
                costUsd: cost,
                avgLatencyMs: 0,
                failureRate: 0,
                latencyTotal: lat,
                failures: r.succeeded ? 0 : 1,
            });
        }
    }

    return Array.from(map.values())
        .map((row) => ({
            groupKey: row.groupKey,
            runs: row.runs,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            costUsd: round6(row.costUsd),
            avgLatencyMs:
                row.runs > 0 ? Math.round(row.latencyTotal / row.runs) : 0,
            failureRate:
                row.runs > 0 ? round4(row.failures / row.runs) : 0,
        }))
        .sort((a, b) => b.costUsd - a.costUsd)
        .slice(0, limit);
}

function pickKey(r: RawRun, groupBy: GroupBy): string | null {
    switch (groupBy) {
        case "agent":
            return r.agent_slug;
        case "conversation":
            return r.conversation_id ?? r.session_id; // sessions are conversation-like for non-CS agents
        case "customer":
            return r.customer_id;
        case "day":
            return r.created_at.slice(0, 10);
    }
}

function computeTotals(runs: RawRun[]): {
    runs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    failureRate: number;
} {
    let totalCost = 0;
    let inTok = 0;
    let outTok = 0;
    let failures = 0;
    for (const r of runs) {
        totalCost += toNumber(r.cost_usd);
        inTok += r.input_tokens ?? 0;
        outTok += r.output_tokens ?? 0;
        if (!r.succeeded) failures += 1;
    }
    return {
        runs: runs.length,
        inputTokens: inTok,
        outputTokens: outTok,
        costUsd: round6(totalCost),
        failureRate: runs.length > 0 ? round4(failures / runs.length) : 0,
    };
}

function rollupToCsv(rows: RollupRow[], groupBy: GroupBy): string {
    const header = [
        groupBy,
        "runs",
        "input_tokens",
        "output_tokens",
        "cost_usd",
        "avg_latency_ms",
        "failure_rate",
    ].join(",");
    const lines = rows.map((r) =>
        [
            csvEscape(r.groupKey),
            r.runs,
            r.inputTokens,
            r.outputTokens,
            r.costUsd,
            r.avgLatencyMs,
            r.failureRate,
        ].join(","),
    );
    return [header, ...lines].join("\n") + "\n";
}

function csvEscape(s: string): string {
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function toNumber(v: number | string | null): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    const parsed = Number.parseFloat(v);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round6(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000;
}
function round4(n: number): number {
    return Math.round(n * 10_000) / 10_000;
}

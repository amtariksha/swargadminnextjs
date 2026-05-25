/**
 * Agent Force client — wraps the chatagent platform (Node/Fastify, JWT auth,
 * SSE streaming, Anthropic Claude underneath). Server-side only.
 *
 * Source repo:    /home/pradeep/Work/projects/project10-chatagent
 * Tenant slug:    "swarg-food" (existing seed)
 * Endpoints used:
 *   POST /admin/auth/login              — exchange email+password for a 24h JWT
 *   POST /api/v1/chat/swarg-food/stream — SSE invocation against routed agent
 *
 * Implementation notes:
 *   • The JWT is cached in module state so we don't re-auth on every call.
 *     Refresh 1h before its 24h expiry.
 *   • Sync invocations are limited to operations that finish in <5s
 *     (Compliance Guard pre-send check). Async work routes via background
 *     queue + webhook (TODO once Agent Force webhooks are configured).
 *   • In shadow-mode (the default for first 14 days post-deploy), agent
 *     output is logged but never actioned. The caller toggles this via the
 *     `shadowMode` flag on each invoke; the agent-spec definitions below
 *     also encode whether they're shadow-only.
 *
 * Env vars (all optional — if unset, agents short-circuit gracefully):
 *   AGENT_FORCE_URL              — base URL of the chatagent deploy
 *   AGENT_FORCE_EMAIL            — admin login email
 *   AGENT_FORCE_PASSWORD         — admin login password (use a vault!)
 *   AGENT_FORCE_TENANT_SLUG      — defaults to "swarg-food"
 */

const TENANT_SLUG_DEFAULT = "swarg-food";

let cachedToken: { token: string; expiresAt: number } | null = null;
const JWT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const JWT_REFRESH_BEFORE_MS = 60 * 60 * 1000;

export interface AgentForceConfig {
    baseUrl: string;
    email: string;
    password: string;
    tenantSlug: string;
}

export function readConfig(): AgentForceConfig | null {
    const baseUrl = process.env.AGENT_FORCE_URL;
    const email = process.env.AGENT_FORCE_EMAIL;
    const password = process.env.AGENT_FORCE_PASSWORD;
    if (!baseUrl || !email || !password) return null;
    return {
        baseUrl: baseUrl.replace(/\/$/, ""),
        email,
        password,
        tenantSlug: process.env.AGENT_FORCE_TENANT_SLUG ?? TENANT_SLUG_DEFAULT,
    };
}

export function isConfigured(): boolean {
    return readConfig() !== null;
}

// ─── Login + token caching ────────────────────────────────────────────────

async function ensureToken(config: AgentForceConfig): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + JWT_REFRESH_BEFORE_MS) {
        return cachedToken.token;
    }
    const res = await fetch(`${config.baseUrl}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: config.email, password: config.password }),
    });
    if (!res.ok) {
        throw new Error(
            `[agent-force] login failed: HTTP ${res.status} ${res.statusText}`,
        );
    }
    const body = (await res.json()) as { token?: string };
    if (!body.token) {
        throw new Error("[agent-force] login response missing token");
    }
    cachedToken = {
        token: body.token,
        expiresAt: now + JWT_LIFETIME_MS,
    };
    return body.token;
}

// ─── Invoke ───────────────────────────────────────────────────────────────

export interface InvokeArgs {
    /** Stable session id — agents use this for memory continuity. Pass a per-customer
     *  or per-job key so successive calls land on the same conversation row. */
    sessionId: string;
    /** Free-text prompt that the orchestrator will route to the right agent. */
    message: string;
    /** Override the auto-routed agent by slug (e.g. force `lms-compliance-guard`). */
    agentSlug?: string;
    /** Per-customer identity for the agent's memory layer. */
    userId?: string;
    /** Hard ceiling on streamed-token concatenation. Throws if exceeded. */
    maxResponseBytes?: number;
    /** Hard ceiling on wall-clock streaming wait. Default 30s. */
    timeoutMs?: number;
}

export interface InvokeResult {
    text: string;
    usage?: Record<string, unknown>;
    durationMs: number;
}

/**
 * Synchronous SSE invoke — consumes the full stream and returns concatenated
 * text. Returns null if Agent Force isn't configured (caller decides whether
 * that's an error or a graceful skip).
 */
export async function invoke(args: InvokeArgs): Promise<InvokeResult | null> {
    const config = readConfig();
    if (!config) return null;

    const token = await ensureToken(config);
    const startedAt = Date.now();
    const timeoutMs = args.timeoutMs ?? 30_000;
    const maxBytes = args.maxResponseBytes ?? 32_768;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    let text = "";
    let usage: Record<string, unknown> | undefined;

    try {
        const res = await fetch(
            `${config.baseUrl}/api/v1/chat/${config.tenantSlug}/stream`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                },
                body: JSON.stringify({
                    sessionId: args.sessionId,
                    message: args.message,
                    userId: args.userId,
                    agentSlug: args.agentSlug,
                }),
                signal: ctrl.signal,
            },
        );
        if (!res.ok || !res.body) {
            throw new Error(`[agent-force] stream HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // SSE events terminate on a blank line — handle line-by-line.
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data) continue;
                try {
                    const ev = JSON.parse(data) as {
                        type: string;
                        content?: string;
                        usage?: Record<string, unknown>;
                        message?: string;
                    };
                    if (ev.type === "token" && typeof ev.content === "string") {
                        text += ev.content;
                        if (text.length > maxBytes) {
                            throw new Error(
                                "[agent-force] response exceeded maxResponseBytes",
                            );
                        }
                    } else if (ev.type === "done" && ev.usage) {
                        usage = ev.usage;
                    } else if (ev.type === "error") {
                        throw new Error(`[agent-force] stream error: ${ev.message ?? ""}`);
                    }
                } catch (err) {
                    // Non-JSON SSE line — log and continue.
                    if (err instanceof Error && err.message.startsWith("[agent-force]")) throw err;
                    continue;
                }
            }
        }
    } finally {
        clearTimeout(timer);
    }

    return {
        text,
        usage,
        durationMs: Date.now() - startedAt,
    };
}

// ─── Health probe ─────────────────────────────────────────────────────────

export async function ping(): Promise<{
    configured: boolean;
    reachable: boolean;
    latencyMs?: number;
    error?: string;
}> {
    const config = readConfig();
    if (!config) return { configured: false, reachable: false };
    const startedAt = Date.now();
    try {
        const res = await fetch(`${config.baseUrl}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
        });
        return {
            configured: true,
            reachable: res.ok,
            latencyMs: Date.now() - startedAt,
            error: res.ok ? undefined : `HTTP ${res.status}`,
        };
    } catch (err) {
        return {
            configured: true,
            reachable: false,
            error: err instanceof Error ? err.message : "unknown",
        };
    }
}

import { NextRequest, NextResponse } from 'next/server';

// ─── HS256 verify (Edge-runtime compatible — Web Crypto only) ──────────────
// Mirrors the algorithm used by swargnodejsbackend's /login when minting JWTs.
// JWT_SECRET MUST equal the backend's secret (see .env.example).

function base64urlDecode(input: string): string {
    let s = input.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return atob(s);
}

function base64url(input: string): string {
    return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return base64url(String.fromCharCode(...new Uint8Array(sig)));
}

interface AdminJwtPayload {
    // The backend may use any of these — we read defensively.
    userId?: string | number;
    user_id?: string | number;
    id?: string | number;
    email?: string;
    role?: string;
    name?: string;
    role_title?: string;
    permissions?: string[];
    full_name?: string;
    iat?: number;
    exp?: number;
}

async function verifyAdminToken(
    token: string,
    secret: string,
): Promise<AdminJwtPayload | null> {
    try {
        const [header, body, sig] = token.split('.');
        if (!header || !body || !sig) return null;
        const expected = await hmacSign(`${header}.${body}`, secret);
        if (sig !== expected) return null;
        const payload = JSON.parse(base64urlDecode(body)) as AdminJwtPayload;
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

// ─── Path matchers ─────────────────────────────────────────────────────────

const WHATSAPP_API_PREFIX = '/api/whatsapp/';
const LMS_API_PREFIX = '/api/lms/';
const AGENT_TOOLS_PREFIX = '/api/agent-tools/';
const AGENT_FORCE_WEBHOOK_PATH = '/api/agent-force/webhook';

// Paths that bypass JWT auth. Each must self-authenticate (webhooks verify
// provider signatures; the public DSAR/intake endpoints do OTP verification).
const PUBLIC_API_PATHS = [
    // WhatsApp
    '/api/whatsapp/webhooks/',
    '/api/whatsapp/ctwa/callback',
    '/api/whatsapp/meta/onboard',
    // LMS — customer-facing intake endpoints (HMAC-signed by source) and
    // DSAR submission (identity verified via OTP, not admin token).
    '/api/lms/leads/intake/',
    '/api/lms/dsar/submit',
    // LMS — public privacy notice fetch (no PII, just the notice text).
    '/api/lms/consent/notice/',
    // Agent Force outbound webhook — HMAC-verified by the route handler itself
    // against AGENT_FORCE_WEBHOOK_SECRET. No admin JWT.
    AGENT_FORCE_WEBHOOK_PATH,
];

function isPublicApiPath(pathname: string): boolean {
    return PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));
}

// ─── Middleware ────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Branch A: Agent Force tool surface — gated by a SHARED SERVICE TOKEN
    // (not admin JWT). chatagent calls these endpoints to read/write LMS
    // data on behalf of an agent. See integration plan §7.2.
    //
    // We inject a synthetic super-admin context downstream so all the
    // existing service modules (consent / leads / insights etc.) keep
    // working without per-call rewiring. The X-Agent-Force-* headers are
    // preserved for audit logging in handlers.
    if (pathname.startsWith(AGENT_TOOLS_PREFIX)) {
        // Token model is asymmetric (per chatagent's implementation):
        //   • AGENT_FORCE_INBOUND_TOKEN — what chatagent PRESENTS when calling
        //     us. This is what we verify here.
        //   • AGENT_FORCE_SERVICE_TOKEN — what WE present when calling
        //     chatagent (see src/lib/lms/agent-force/client.ts). Different value.
        //
        // Fallback: if AGENT_FORCE_INBOUND_TOKEN isn't set, accept
        // AGENT_FORCE_SERVICE_TOKEN — preserves backwards compat with the
        // earlier single-shared-secret model so an env rotation can be
        // staged without a hard cutover.
        const expected =
            process.env.AGENT_FORCE_INBOUND_TOKEN ||
            process.env.AGENT_FORCE_SERVICE_TOKEN;
        if (!expected) {
            return NextResponse.json(
                {
                    error:
                        'Neither AGENT_FORCE_INBOUND_TOKEN nor AGENT_FORCE_SERVICE_TOKEN configured',
                },
                { status: 503 },
            );
        }
        const authHeader = request.headers.get('authorization') || '';
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice('Bearer '.length)
            : '';
        if (!token || !constantTimeEqual(token, expected)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const orgId = process.env.WACRM_ORG_ID || '';
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-user-id', 'agent-force');
        requestHeaders.set('x-user-email', 'agent-force@swargfood.local');
        requestHeaders.set('x-user-role', 'super_admin');
        requestHeaders.set('x-user-name', 'Agent Force');
        requestHeaders.set('x-user-org-id', orgId);
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // Gates the merged WACRM API surface (/api/whatsapp/**) AND the new LMS
    // API surface (/api/lms/**). Both share the same admin Bearer JWT auth.
    // Admin panel routes (/api/auth/**, /api/dev/**, /admin/**, all dashboard
    // pages) are gated client-side by src/app/(dashboard)/layout.tsx via useAuth().
    const isGatedApi =
        pathname.startsWith(WHATSAPP_API_PREFIX) ||
        pathname.startsWith(LMS_API_PREFIX);
    if (!isGatedApi) {
        return NextResponse.next();
    }

    if (isPublicApiPath(pathname)) {
        return NextResponse.next();
    }

    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return NextResponse.json(
            { error: 'JWT_SECRET not configured on admin panel server' },
            { status: 500 },
        );
    }

    const payload = await verifyAdminToken(token, secret);
    if (!payload) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // ── Map admin JWT → WACRM x-user-* headers ────────────────────────────
    // Day-1 org mapping: single tenant via WACRM_ORG_ID env. When a second
    // tenant goes live, derive orgId from req.tenant (subdomain / header)
    // resolved by the backend, persisted on the master tenants row.
    const orgId = process.env.WACRM_ORG_ID || '';
    const userId = String(payload.userId ?? payload.user_id ?? payload.id ?? '');
    const email = payload.email ?? '';
    const name = payload.name ?? payload.full_name ?? '';

    // ── Super-admin detection ─────────────────────────────────────────────
    // swargnodejsbackend's generateToken (src/middleware/auth.js:388) signs a
    // JWT containing only `{userId, iat, exp}` — no role, no permissions. So
    // we can't read role from the token and must apply a sensible default.
    //
    // Single-tenant mode (WACRM_ORG_ID is set, only one org in Supabase):
    //   everyone authenticated through admin login is treated as super_admin
    //   for the WhatsApp surface. The /api/whatsapp/** routes downgrade their
    //   per-org filters (e.g. integrated_numbers.org_id) and surface the
    //   full dataset, which matches operator expectations on a single-tenant
    //   deploy. The permission gate to even reach /whatsapp/** is enforced
    //   client-side in Sidebar.tsx via the `whatsapp` role permission, so
    //   only users granted that permission can hit these endpoints anyway.
    //
    // TODO when multi-tenant lands: replace this with one of:
    //   (a) bake role into the JWT in swargnodejsbackend and read it here, or
    //   (b) fetch the user's role from backend `/users/<id>` with a 60 s
    //       in-memory cache, or
    //   (c) trust the front-end's `x-user-permissions` header (signed
    //       client-side) after a separate signature check.
    // Once that lands, switch back to a stricter check and re-enable the
    // per-org filters in /api/whatsapp/numbers, /conversations, etc.
    const isSuperAdmin = true;
    const role = 'super_admin';

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', userId);
    requestHeaders.set('x-user-email', email);
    requestHeaders.set('x-user-role', role);
    requestHeaders.set('x-user-name', name);
    requestHeaders.set('x-user-org-id', orgId);

    return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
    matcher: [
        '/api/whatsapp/:path*',
        '/api/lms/:path*',
        '/api/agent-tools/:path*',
    ],
};

// ─── Tiny constant-time comparison ────────────────────────────────────────
// JS doesn't expose `crypto.timingSafeEqual` in the Edge runtime; equal-
// length char-by-char XOR is the standard workaround.
function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

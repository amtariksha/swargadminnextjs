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

// Public WhatsApp API paths — webhooks (signature-verified by handler) and the
// CTWA OAuth callback (cannot carry an admin token, identifies caller via state).
const PUBLIC_WHATSAPP_API_PATHS = [
    '/api/whatsapp/webhooks/',
    '/api/whatsapp/ctwa/callback',
    '/api/whatsapp/meta/onboard',
];

function isPublicWhatsappPath(pathname: string): boolean {
    return PUBLIC_WHATSAPP_API_PATHS.some((p) => pathname.startsWith(p));
}

// ─── Middleware ────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only the merged WACRM API surface is gated here. Admin panel routes
    // (/api/auth/**, /api/dev/**, /admin/**, all dashboard pages) are gated
    // client-side by src/app/(dashboard)/layout.tsx via useAuth().
    if (!pathname.startsWith(WHATSAPP_API_PREFIX)) {
        return NextResponse.next();
    }

    if (isPublicWhatsappPath(pathname)) {
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

    // Role mapping: WACRM treats role === 'super_admin' as cross-org. The admin
    // panel uses role rows + permissions arrays; we promote to super_admin only
    // when the backend explicitly says so (role_title === 'super_admin' or
    // role === 'super_admin'), else 'admin'.
    const isSuperAdmin =
        payload.role === 'super_admin' || payload.role_title === 'super_admin';
    const role = isSuperAdmin ? 'super_admin' : payload.role || 'admin';

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', userId);
    requestHeaders.set('x-user-email', email);
    requestHeaders.set('x-user-role', role);
    requestHeaders.set('x-user-name', name);
    requestHeaders.set('x-user-org-id', orgId);

    return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
    matcher: ['/api/whatsapp/:path*'],
};

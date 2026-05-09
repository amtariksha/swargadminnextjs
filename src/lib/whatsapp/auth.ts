import bcrypt from "bcryptjs";

// ─── JWT Secret ────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "wacrm-default-secret-change-me";

// ─── Password Helpers ──────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export async function verifyPassword(
    password: string,
    hash: string
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// ─── JWT Helpers (manual HS256 — no external dep) ──────────
// Using simple base64url-encoded JSON + HMAC-SHA256 via Web Crypto

function base64url(input: string): string {
    return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): string {
    let s = input.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return atob(s);
}

async function hmacSign(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(data)
    );
    return base64url(
        String.fromCharCode(...new Uint8Array(signature))
    );
}

export interface TokenPayload {
    userId: string;
    email: string;
    role: string;
    name: string;
    orgId: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const body = base64url(
        JSON.stringify({
            ...payload,
            iat: now,
            exp: now + 7 * 24 * 60 * 60, // 7 days
        })
    );
    const signature = await hmacSign(`${header}.${body}`, JWT_SECRET);
    return `${header}.${body}.${signature}`;
}

export async function verifyToken(
    token: string
): Promise<(TokenPayload & { iat: number; exp: number }) | null> {
    try {
        const [header, body, sig] = token.split(".");
        if (!header || !body || !sig) return null;

        const expectedSig = await hmacSign(`${header}.${body}`, JWT_SECRET);
        if (sig !== expectedSig) return null;

        const payload = JSON.parse(base64urlDecode(body));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null; // expired
        }
        return payload;
    } catch {
        return null;
    }
}

// ─── Cookie name constant ──────────────────────────────────
export const AUTH_COOKIE = "wacrm_token";

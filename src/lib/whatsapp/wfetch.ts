/**
 * Authenticated fetch used by every WhatsApp client-side call.
 *
 * Reads the admin JWT from localStorage['admin'] (matches the shape used by
 * src/lib/api.ts in the admin panel) and forwards it as a Bearer token. The
 * middleware at src/middleware.ts verifies it against JWT_SECRET and injects
 * x-user-* headers, so the original WACRM route handlers (which call
 * getRequestContext from @/lib/whatsapp/request) work unchanged.
 *
 * On the server we just delegate to the global fetch.
 */
export function wfetch(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    if (typeof window === "undefined") {
        return fetch(input, init);
    }
    let token = "";
    try {
        const stored = window.localStorage.getItem("admin");
        if (stored) {
            const parsed = JSON.parse(stored);
            token = parsed?.token || "";
        }
    } catch {
        // ignore — request will hit middleware unauthenticated and 401
    }
    const headers = new Headers(init?.headers);
    if (token && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers });
}

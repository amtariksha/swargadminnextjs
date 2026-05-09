import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy proxies — defer client construction until the first property access so
// `next build` can statically analyse the API routes without crashing when
// SUPABASE_* env vars haven't been set in the build environment. At runtime
// (production / dev) the env vars must be present; otherwise the first call
// throws a clear error.

function buildAdminClient(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) {
        throw new Error(
            "[whatsapp/supabase] NEXT_PUBLIC_SUPABASE_URL is not set — required by /api/whatsapp/**.",
        );
    }
    const key = serviceKey || publishable;
    if (!key) {
        throw new Error(
            "[whatsapp/supabase] SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as fallback) is not set.",
        );
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

function buildPublicClient(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    if (!url || !publishable) {
        throw new Error(
            "[whatsapp/supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY are not set.",
        );
    }
    return createClient(url, publishable);
}

let _admin: SupabaseClient | null = null;
let _public: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
    if (!_admin) _admin = buildAdminClient();
    return _admin;
}

function getPublic(): SupabaseClient {
    if (!_public) _public = buildPublicClient();
    return _public;
}

// Proxies preserve the existing import shape — `supabaseAdmin.from(...)` works
// unchanged in every WACRM-derived API route. Construction is deferred until
// the first property access.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get: (_t, prop, receiver) => Reflect.get(getAdmin(), prop, receiver),
});

export const supabase = new Proxy({} as SupabaseClient, {
    get: (_t, prop, receiver) => Reflect.get(getPublic(), prop, receiver),
});

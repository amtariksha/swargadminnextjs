/**
 * LMS Supabase client — schema-aware wrapper around the existing WhatsApp
 * Supabase admin client. All LMS tables live under the `app_lms` schema in
 * the same Supabase project that hosts the WhatsApp data (per locked
 * architectural decision in ~/.claude/plans/familiarize-yourself-with-this-encapsulated-panda.md).
 *
 * Usage:
 *   import { lmsAdmin } from "@/lib/lms/supabase";
 *   const { data } = await lmsAdmin.from("lms_consent_records").select(...);
 *
 * IMPORTANT — operator one-time setup:
 *   The Supabase project's PostgREST defaults to exposing only the `public`
 *   schema via the REST API. The `app_lms` schema MUST be added to the
 *   exposed-schemas list before any of these queries will succeed:
 *
 *     Supabase Dashboard → Project Settings → API → "Exposed schemas"
 *     → add  app_lms  → Save
 *
 *   Then PostgREST will route REST requests against app_lms.lms_* tables.
 *   Without this, queries fail with "PGRST: schema not found" type errors.
 *
 * Implementation note: like the underlying `supabaseAdmin`, this export is a
 * lazy Proxy. Calling `.schema('app_lms')` directly at module-load triggers
 * the underlying proxy's getter, which throws if Supabase env vars aren't set
 * (e.g. during `next build` page-data collection). Wrapping in our own proxy
 * defers the schema-binding until first real access.
 */

import { supabaseAdmin } from "@/lib/whatsapp/supabase";

// Minimal type that captures the surface used by callers — .from(), .rpc(),
// .schema() chains all go through the underlying client. Casting through
// `unknown` because the schema-bound builder's type isn't directly exported.
type LmsClientLike = ReturnType<typeof supabaseAdmin.schema>;

let cached: LmsClientLike | null = null;

function resolve(): LmsClientLike {
    if (!cached) {
        cached = supabaseAdmin.schema("app_lms");
    }
    return cached;
}

/**
 * Schema-scoped Supabase client for the `app_lms` namespace.
 * The underlying connection is shared with `supabaseAdmin` — we just bind
 * the schema once (lazily) so every `.from('lms_*')` call hits app_lms.
 */
export const lmsAdmin = new Proxy({} as LmsClientLike, {
    get: (_t, prop, receiver) => Reflect.get(resolve(), prop, receiver),
});

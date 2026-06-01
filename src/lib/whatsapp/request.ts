/**
 * The single internal organization id.
 *
 * WhatsApp + LMS operate as ONE org internally (the outer Swarg platform stays
 * multi-tenant). Use this constant instead of threading an org through requests
 * / filtering by it. Matches the historical `WACRM_ORG_ID` and the webhooks'
 * former `DEFAULT_ORG_ID`. The org_id columns are retained (with a DB DEFAULT of
 * this value — migration 008) and are dropped in a later coordinated pass.
 */
export const ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Extract user context from request headers set by proxy.ts.
 *
 * NOTE: `orgId`/`isSuperAdmin` are retained for agent-tools and future platform
 * tenancy, but WhatsApp + LMS no longer scope by them — they operate as a single
 * org (see ORG_ID above).
 */
export interface RequestContext {
    userId: string;
    email: string;
    role: string;
    name: string;
    orgId: string;
    isSuperAdmin: boolean;
}

export function getRequestContext(headers: Headers): RequestContext {
    return {
        userId: headers.get("x-user-id") || "",
        email: headers.get("x-user-email") || "",
        role: headers.get("x-user-role") || "",
        name: headers.get("x-user-name") || "",
        orgId: headers.get("x-user-org-id") || "",
        isSuperAdmin: headers.get("x-user-role") === "super_admin",
    };
}

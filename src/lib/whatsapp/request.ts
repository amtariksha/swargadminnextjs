/**
 * Extract user context from request headers set by proxy.ts.
 * All authenticated API routes should call this to get org_id for scoping.
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

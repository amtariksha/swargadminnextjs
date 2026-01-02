/**
 * Tenant Configuration
 * Centralized tenant settings loaded from environment variables
 */

// Tenant identification
export const TENANT_CODE = process.env.NEXT_PUBLIC_TENANT_CODE || 'swarg';
export const TENANT_NAME = process.env.NEXT_PUBLIC_TENANT_NAME || 'Swarg Desi Cow Milk';

// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://node.desicowmilk.com';

// Build the API URL with tenant code
// Special case: 'swarg' uses /api (backward compatibility)
// Other tenants use /api/{tenant_code}
export const getApiUrl = (): string => {
    const baseUrl = API_BASE_URL.replace(/\/$/, ''); // Remove trailing slash

    // For Swarg tenant, use original /api endpoint (backward compatibility)
    if (TENANT_CODE === 'swarg') {
        return `${baseUrl}/api`;
    }

    // For other tenants, use /api/{tenant_code}
    return `${baseUrl}/api/${TENANT_CODE}`;
};

// For backward compatibility - APIs that don't need tenant prefix
export const getApiUrlNoTenant = (): string => {
    const baseUrl = API_BASE_URL.replace(/\/$/, '');
    return `${baseUrl}/api`;
};

// Image base URL
export const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_IMAGE_BASE_URL || `${API_BASE_URL}/public/uploads/images`;

// Branding
export const BRANDING = {
    appName: TENANT_NAME,
    logo: process.env.NEXT_PUBLIC_LOGO_URL || '/logo.png',
    favicon: process.env.NEXT_PUBLIC_FAVICON_URL || '/favicon.ico',
    primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR || '#4CAF50',
    secondaryColor: process.env.NEXT_PUBLIC_SECONDARY_COLOR || '#FF9800',
};

// Feature flags (can be overridden by tenant)
export const FEATURES = {
    whatsapp: process.env.NEXT_PUBLIC_FEATURE_WHATSAPP === 'true',
    deliveryApp: process.env.NEXT_PUBLIC_FEATURE_DELIVERY_APP !== 'false', // default true
    subscriptions: process.env.NEXT_PUBLIC_FEATURE_SUBSCRIPTIONS !== 'false', // default true
    wallet: process.env.NEXT_PUBLIC_FEATURE_WALLET !== 'false', // default true
};

export default {
    TENANT_CODE,
    TENANT_NAME,
    API_BASE_URL,
    IMAGE_BASE_URL,
    BRANDING,
    FEATURES,
    getApiUrl,
    getApiUrlNoTenant,
};

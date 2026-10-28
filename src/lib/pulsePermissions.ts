// Business Pulse section rights. The parent 'business-pulse' key still shows
// every section (existing CEO roles keep the whole page); each key below shows
// just its own section, so one card can be shared without the rest. Shared by
// the Roles page (checkboxes), the Sidebar (nav visibility) and the page itself.
export const PULSE_PARENT_PERMISSION = 'business-pulse';

export const PULSE_SECTION_PERMISSIONS = {
    revenue: 'pulse-revenue',
    shopOutstanding: 'pulse-shop-outstanding',
    subscriptions: 'pulse-subscriptions',
    wastage: 'pulse-wastage',
    drivers: 'pulse-drivers',
    vendorVariance: 'pulse-vendor-variance',
} as const;

export type PulseSection = keyof typeof PULSE_SECTION_PERMISSIONS;

export const PULSE_SECTION_LABELS: Readonly<Record<PulseSection, string>> = {
    revenue: 'Pulse: Revenue',
    shopOutstanding: 'Pulse: Shop Outstanding',
    subscriptions: 'Pulse: Subscriptions',
    wastage: 'Pulse: Wastage',
    drivers: 'Pulse: Drivers',
    vendorVariance: 'Pulse: Vendor Pricing',
};

export const PULSE_SECTION_KEYS: readonly string[] = Object.values(PULSE_SECTION_PERMISSIONS);

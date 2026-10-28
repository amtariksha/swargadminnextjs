'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
    PULSE_PARENT_PERMISSION,
    PULSE_SECTION_PERMISSIONS,
    type PulseSection,
} from '@/lib/pulsePermissions';
import { RevenueSection } from '@/components/pulse/RevenueSection';
import { SubscriptionsSection } from '@/components/pulse/SubscriptionsSection';
import { WastageSection } from '@/components/pulse/WastageSection';
import { DriversSection } from '@/components/pulse/DriversSection';
import { VendorVarianceSection } from '@/components/pulse/VendorVarianceSection';
import { ShopOutstandingSection } from '@/components/pulse/ShopOutstandingSection';

/**
 * Business Pulse (Phase 5) — CEO overview backed by the v_pulse_* views
 * (backend migration 101) via /api/pulse/*. The 'business-pulse' permission
 * shows every section; the per-section 'pulse-*' keys show one section each.
 * Full-access roles see everything.
 */
export default function BusinessPulsePage() {
    const [months, setMonths] = useState<6 | 12 | 24>(12);
    const { hasPermission } = useAuth();
    const canSee = (section: PulseSection) =>
        hasPermission(PULSE_PARENT_PERMISSION) || hasPermission(PULSE_SECTION_PERMISSIONS[section]);
    const showMonths = canSee('revenue') || canSee('subscriptions');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-white">Business Pulse</h1>
                    <p className="text-slate-400">
                        Revenue, shop outstanding, subscriptions, wastage, drivers and vendor pricing — refreshed on load.
                    </p>
                </div>
                {showMonths && (
                    <div className="flex gap-1">
                        {([6, 12, 24] as const).map((m) => (
                            <button key={m} onClick={() => setMonths(m)}
                                className={`px-3 py-1.5 rounded-lg text-sm ${months === m
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}>
                                {m} months
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {canSee('revenue') && <RevenueSection months={months} />}
            {canSee('shopOutstanding') && <ShopOutstandingSection />}
            {canSee('subscriptions') && <SubscriptionsSection months={months} />}
            {canSee('wastage') && <WastageSection />}
            {canSee('drivers') && <DriversSection />}
            {canSee('vendorVariance') && <VendorVarianceSection />}
        </div>
    );
}

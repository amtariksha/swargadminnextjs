'use client';

import { useState } from 'react';
import { RevenueSection } from '@/components/pulse/RevenueSection';
import { SubscriptionsSection } from '@/components/pulse/SubscriptionsSection';
import { WastageSection } from '@/components/pulse/WastageSection';
import { DriversSection } from '@/components/pulse/DriversSection';
import { VendorVarianceSection } from '@/components/pulse/VendorVarianceSection';

/**
 * Business Pulse (Phase 5) — CEO overview backed by the v_pulse_* views
 * (backend migration 101) via /api/pulse/*. Grant the 'business-pulse'
 * permission on /roles to expose it; full-access roles see it automatically.
 */
export default function BusinessPulsePage() {
    const [months, setMonths] = useState<6 | 12 | 24>(12);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-white">Business Pulse</h1>
                    <p className="text-slate-400">
                        Revenue, subscriptions, wastage, drivers and vendor pricing — refreshed on load.
                    </p>
                </div>
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
            </div>

            <RevenueSection months={months} />
            <SubscriptionsSection months={months} />
            <WastageSection />
            <DriversSection />
            <VendorVarianceSection />
        </div>
    );
}

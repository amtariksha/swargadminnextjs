'use client';

import { CreditCard } from 'lucide-react';

export default function PaymentSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Payment Gateway</h1>
                <p className="text-slate-400">Configure payment providers</p>
            </div>
            <div className="glass rounded-2xl p-8 text-center">
                <CreditCard className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400">Payment gateway settings coming soon</p>
            </div>
        </div>
    );
}

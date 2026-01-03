'use client';

import { Receipt } from 'lucide-react';

export default function InvoiceSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Invoice Settings</h1>
                <p className="text-slate-400">Configure invoice templates</p>
            </div>
            <div className="glass rounded-2xl p-8 text-center">
                <Receipt className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400">Invoice settings coming soon</p>
            </div>
        </div>
    );
}

'use client';

import { Globe } from 'lucide-react';

export default function WebappSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Web App Settings</h1>
                <p className="text-slate-400">Configure web application options</p>
            </div>
            <div className="glass rounded-2xl p-8 text-center">
                <Globe className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400">Web app settings coming soon</p>
            </div>
        </div>
    );
}

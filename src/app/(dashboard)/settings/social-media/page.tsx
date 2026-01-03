'use client';

import { Settings } from 'lucide-react';

export default function SocialMediaSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Social Media Settings</h1>
                <p className="text-slate-400">Manage social media links</p>
            </div>
            <div className="glass rounded-2xl p-8 text-center">
                <Settings className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400">Social media settings coming soon</p>
            </div>
        </div>
    );
}

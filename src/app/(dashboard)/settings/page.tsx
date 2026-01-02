'use client';

import { useSettings } from '@/hooks/useData';
import { Settings, Save } from 'lucide-react';

export default function SettingsPage() {
    const { data: settings = [], isLoading } = useSettings();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 spinner" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Settings</h1>
                <p className="text-slate-400">Application configuration</p>
            </div>

            <div className="grid gap-6">
                <div className="glass rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                            <Settings className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">General Settings</h2>
                            <p className="text-sm text-slate-400">Configure app settings</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {settings.length === 0 ? (
                            <p className="text-slate-400">No settings configured yet.</p>
                        ) : (
                            settings.map((setting) => (
                                <div key={setting.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl">
                                    <div>
                                        <p className="font-medium text-white capitalize">{setting.key.replace(/_/g, ' ')}</p>
                                        <p className="text-sm text-slate-400">{setting.type || 'text'}</p>
                                    </div>
                                    <input
                                        type="text"
                                        defaultValue={setting.value}
                                        className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm w-64 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    />
                                </div>
                            ))
                        )}
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                            <Save className="w-5 h-5" />
                            Save Changes
                        </button>
                    </div>
                </div>

                {/* Quick Links */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <a href="/settings/webapp" className="glass rounded-xl p-4 hover:bg-slate-800/50 transition-colors">
                        <p className="font-medium text-white">Web App Settings</p>
                        <p className="text-sm text-slate-400">Configure web application</p>
                    </a>
                    <a href="/settings/invoice" className="glass rounded-xl p-4 hover:bg-slate-800/50 transition-colors">
                        <p className="font-medium text-white">Invoice Settings</p>
                        <p className="text-sm text-slate-400">Configure invoice details</p>
                    </a>
                    <a href="/settings/payment" className="glass rounded-xl p-4 hover:bg-slate-800/50 transition-colors">
                        <p className="font-medium text-white">Payment Gateway</p>
                        <p className="text-sm text-slate-400">Configure payment methods</p>
                    </a>
                    <a href="/settings/social-media" className="glass rounded-xl p-4 hover:bg-slate-800/50 transition-colors">
                        <p className="font-medium text-white">Social Media</p>
                        <p className="text-sm text-slate-400">Configure social links</p>
                    </a>
                </div>
            </div>
        </div>
    );
}

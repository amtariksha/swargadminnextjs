'use client';

import { Wallet, Bell, Send } from 'lucide-react';
import { useState } from 'react';

export default function LowWalletNotificationPage() {
    const [threshold, setThreshold] = useState('100');
    const [message, setMessage] = useState('Your wallet balance is running low. Please recharge to continue enjoying our services.');
    const [isSending, setIsSending] = useState(false);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSending(true);
        setTimeout(() => {
            setIsSending(false);
            alert('Low wallet notifications sent!');
        }, 1000);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Low Wallet Notification</h1>
                <p className="text-slate-400">Notify users with low wallet balance</p>
            </div>

            <div className="glass rounded-2xl p-6 max-w-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Low Balance Alert</h2>
                        <p className="text-sm text-slate-400">Send reminders to recharge</p>
                    </div>
                </div>

                <form onSubmit={handleSend} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Balance Threshold (₹)</label>
                        <input
                            type="number"
                            value={threshold}
                            onChange={(e) => setThreshold(e.target.value)}
                            required
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                        <p className="text-xs text-slate-400 mt-1">Users with balance below this amount will be notified</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                            rows={3}
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSending}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                    >
                        <Send className="w-5 h-5" />
                        {isSending ? 'Sending...' : 'Send Low Balance Alerts'}
                    </button>
                </form>
            </div>
        </div>
    );
}

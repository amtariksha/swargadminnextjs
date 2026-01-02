'use client';

import { Bell, Send } from 'lucide-react';
import { useState } from 'react';

export default function NotificationsPage() {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSending(true);
        // API call would go here
        setTimeout(() => {
            setIsSending(false);
            setTitle('');
            setMessage('');
            alert('Notification sent!');
        }, 1000);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Notifications</h1>
                <p className="text-slate-400">Send push notifications to users</p>
            </div>

            <div className="glass rounded-2xl p-6 max-w-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <Bell className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Send Notification</h2>
                        <p className="text-sm text-slate-400">Broadcast to all users</p>
                    </div>
                </div>

                <form onSubmit={handleSend} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            placeholder="Notification title"
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                            rows={4}
                            placeholder="Notification message..."
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSending}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                    >
                        <Send className="w-5 h-5" />
                        {isSending ? 'Sending...' : 'Send Notification'}
                    </button>
                </form>
            </div>

            <div className="glass rounded-xl p-4 max-w-2xl">
                <a href="/notifications/low-wallet" className="block hover:bg-slate-800/50 -m-4 p-4 rounded-xl transition-colors">
                    <p className="font-medium text-white">Low Wallet Balance Notification</p>
                    <p className="text-sm text-slate-400">Notify users with low wallet balance to recharge</p>
                </a>
            </div>
        </div>
    );
}

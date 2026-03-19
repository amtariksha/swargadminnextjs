'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { POST } from '@/lib/api';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function AddDriverPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        password: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.phone) {
            toast.error('Name and phone are required');
            return;
        }
        setIsSubmitting(true);
        try {
            await POST('/add_user', {
                ...formData,
                role: 4, // Delivery Partner role
            });
            toast.success('Driver added successfully');
            router.push('/drivers');
        } catch (error) {
            console.error('Failed to add driver:', error);
            toast.error('Failed to add driver');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex items-center gap-3">
                    <UserPlus className="w-8 h-8 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Add Driver</h1>
                        <p className="text-slate-400">Create a new delivery partner</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-5">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Name *</label>
                    <input
                        type="text" name="name" value={formData.name} onChange={handleChange} required
                        placeholder="e.g. 05 Kormangala BTM Lobo"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Phone *</label>
                    <input
                        type="tel" name="phone" value={formData.phone} onChange={handleChange} required
                        placeholder="10-digit mobile number"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                    <input
                        type="email" name="email" value={formData.email} onChange={handleChange}
                        placeholder="driver@example.com"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                    <input
                        type="password" name="password" value={formData.password} onChange={handleChange}
                        placeholder="Min 6 characters"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                </div>

                <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => router.back()}
                        className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                        {isSubmitting ? 'Adding...' : 'Add Driver'}
                    </button>
                </div>
            </form>
        </div>
    );
}

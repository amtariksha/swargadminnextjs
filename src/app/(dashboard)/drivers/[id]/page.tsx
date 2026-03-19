'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import { ArrowLeft, Truck, Save } from 'lucide-react';
import { toast } from 'sonner';

interface DriverDetail {
    id: number;
    name: string;
    phone: string;
    email: string;
    status: number;
    is_location: number;
    wallet_amount: number;
}

export default function DriverDetailPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const driverId = params.id as string;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        is_location: 0,
    });

    const { data: driver, isLoading } = useQuery({
        queryKey: ['driver', driverId],
        queryFn: async () => {
            const response = await GET<DriverDetail>(`/get_user/${driverId}`);
            return response.data;
        },
        enabled: !!driverId,
    });

    useEffect(() => {
        if (driver) {
            setFormData({
                name: driver.name || '',
                phone: driver.phone || '',
                email: driver.email || '',
                is_location: driver.is_location ?? 0,
            });
        }
    }, [driver]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.name === 'is_location' ? Number(e.target.value) : e.target.value;
        setFormData(prev => ({ ...prev, [e.target.name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await POST('/update_user', {
                id: driverId,
                ...formData,
            });
            toast.success('Driver updated successfully');
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            queryClient.invalidateQueries({ queryKey: ['driver', driverId] });
        } catch (error) {
            console.error('Failed to update driver:', error);
            toast.error('Failed to update driver');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-10 h-10 spinner" />
            </div>
        );
    }

    if (!driver) {
        return (
            <div className="text-center py-12">
                <p className="text-slate-400">Driver not found</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex items-center gap-3">
                    <Truck className="w-8 h-8 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">{driver.name}</h1>
                        <p className="text-slate-400">Driver #{driver.id}</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-5">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
                    <input
                        type="text" name="name" value={formData.name} onChange={handleChange}
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
                    <input
                        type="tel" name="phone" value={formData.phone} onChange={handleChange}
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                    <input
                        type="email" name="email" value={formData.email} onChange={handleChange}
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Driver Location Tracking</label>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-400">Off</span>
                        <button type="button"
                            onClick={() => setFormData(prev => ({ ...prev, is_location: prev.is_location ? 0 : 1 }))}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${formData.is_location ? 'bg-green-600' : 'bg-slate-700'}`}>
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${formData.is_location ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-sm text-slate-400">On</span>
                    </div>
                </div>

                <div className="glass rounded-xl p-4 space-y-2">
                    <p className="text-sm text-slate-400">Wallet Balance</p>
                    <p className="text-2xl font-bold text-green-400">₹{driver.wallet_amount || 0}</p>
                </div>

                <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => router.back()}
                        className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}

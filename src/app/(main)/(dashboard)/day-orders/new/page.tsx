'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import DaytimeOrderForm from '@/components/DaytimeOrderForm';
import { ArrowLeft, Sun } from 'lucide-react';

export default function NewDaytimeOrderPage() {
    const router = useRouter();
    const queryClient = useQueryClient();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex items-center gap-3">
                    <Sun className="w-7 h-7 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">New Day-time Order</h1>
                        <p className="text-slate-400">Place an order on a customer&apos;s behalf</p>
                    </div>
                </div>
            </div>

            <DaytimeOrderForm
                onSaved={(id) => {
                    queryClient.invalidateQueries({ queryKey: ['daytime-orders'] });
                    router.push(`/day-orders/${id}`);
                }}
            />
        </div>
    );
}

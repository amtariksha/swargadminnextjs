'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useUpdateUser } from '@/hooks/useData';
import { GET, POST } from '@/lib/api';
import FormField, { inputClassName } from '@/components/FormField';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

interface B2bStatus { is_b2b: number; billing_cycle: number; drop_point_id: number | null; route_order: number | null; }

const userSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email').or(z.literal('')).optional(),
    phone: z.string().min(10, 'Phone must be at least 10 digits'),
});

type UserFormData = z.infer<typeof userSchema>;

export default function EditUserPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data: user, isLoading } = useUser(id);
    const updateUser = useUpdateUser();

    const { register, handleSubmit, reset, formState: { errors } } = useForm<UserFormData>({
        resolver: zodResolver(userSchema),
    });

    // B2B shop status (customer_type + its 1:1 'shop' drop point).
    const [b2b, setB2b] = useState<B2bStatus | null>(null);
    const [b2bSaving, setB2bSaving] = useState(false);

    useEffect(() => {
        let active = true;
        GET<B2bStatus>(`/admin/customer_b2b_status/${id}`)
            .then((r) => { if (active && r.data) setB2b(r.data); })
            .catch(() => { });
        return () => { active = false; };
    }, [id]);

    const saveB2b = async (is_b2b: number, billing_cycle: number, okMsg: string) => {
        setB2bSaving(true);
        try {
            await POST('/admin/set_b2b_shop', { user_id: Number(id), is_b2b, billing_cycle });
            const r = await GET<B2bStatus>(`/admin/customer_b2b_status/${id}`);
            if (r.data) setB2b(r.data);
            toast.success(okMsg);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update B2B status');
        } finally {
            setB2bSaving(false);
        }
    };

    const toggleB2b = () => {
        if (!b2b) return;
        const next = b2b.is_b2b === 1 ? 0 : 1;
        saveB2b(next, b2b.billing_cycle, next === 1 ? 'Marked as B2B shop' : 'Removed B2B shop');
    };

    const generateBill = async () => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        setB2bSaving(true);
        try {
            const r = await POST<{ invoice_number?: string }>('/admin/generate_monthly_bill', { user_id: Number(id), from, to });
            toast.success(r.message || 'Bill generated');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to generate bill');
        } finally {
            setB2bSaving(false);
        }
    };

    useEffect(() => {
        if (user) {
            reset({
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
            });
        }
    }, [user, reset]);

    const onSubmit = async (data: UserFormData) => {
        try {
            await updateUser.mutateAsync({ id: Number(id), ...data });
            toast.success('User updated successfully');
            router.push(`/users/${id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update user');
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-32 bg-slate-800/50 rounded animate-pulse" />
                <div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white">Edit User</h1>
                    <p className="text-slate-400">{user?.name} - #{id}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-xl p-6 space-y-6 max-w-lg">
                <FormField label="Name" error={errors.name} required>
                    <input {...register('name')} className={inputClassName} placeholder="Full name" />
                </FormField>
                <FormField label="Email" error={errors.email}>
                    <input {...register('email')} type="email" className={inputClassName} placeholder="Email address" />
                </FormField>
                <FormField label="Phone" error={errors.phone} required>
                    <input {...register('phone')} className={inputClassName} placeholder="Phone number" />
                </FormField>

                <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                    <button type="button" onClick={() => router.back()} className="px-6 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl hover:bg-slate-800">
                        Cancel
                    </button>
                    <button type="submit" disabled={updateUser.isPending} className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {updateUser.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>

            <div className="glass rounded-xl p-6 max-w-lg space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-white font-semibold">B2B Shop</h2>
                        <p className="text-xs text-slate-500 mt-1">
                            {b2b == null
                                ? 'Loading…'
                                : b2b.is_b2b === 1
                                    ? `This customer is a B2B shop${b2b.drop_point_id ? ` · drop point #${b2b.drop_point_id}` : ''}. Orders route to the truck and bill by invoice (no wallet).`
                                    : 'Mark as a B2B shop — orders route to the truck via a dedicated drop point and bill by invoice instead of wallet.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={toggleB2b}
                        disabled={b2b == null || b2bSaving}
                        className={`shrink-0 px-4 py-2 text-sm rounded-xl disabled:opacity-50 ${b2b?.is_b2b === 1
                            ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                            : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                            }`}
                    >
                        {b2bSaving ? 'Saving…' : b2b?.is_b2b === 1 ? 'Remove B2B' : 'Mark as B2B shop'}
                    </button>
                </div>

                {b2b?.is_b2b === 1 && (
                    <div className="border-t border-slate-800/50 pt-4 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm text-white">Billing cycle</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {b2b.billing_cycle === 1
                                        ? 'Monthly — one consolidated invoice per month (no per-delivery invoices).'
                                        : 'Per delivery — each delivery is invoiced.'}
                                </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button type="button" disabled={b2bSaving} onClick={() => saveB2b(1, 0, 'Set to per-delivery billing')}
                                    className={`px-3 py-1.5 text-xs rounded-lg disabled:opacity-50 ${b2b.billing_cycle === 0 ? 'bg-purple-500/30 text-purple-200' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                                    Per delivery
                                </button>
                                <button type="button" disabled={b2bSaving} onClick={() => saveB2b(1, 1, 'Set to monthly billing')}
                                    className={`px-3 py-1.5 text-xs rounded-lg disabled:opacity-50 ${b2b.billing_cycle === 1 ? 'bg-purple-500/30 text-purple-200' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                                    Monthly
                                </button>
                            </div>
                        </div>
                        {b2b.billing_cycle === 1 && (
                            <button type="button" onClick={generateBill} disabled={b2bSaving}
                                className="w-full px-4 py-2 text-sm rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50">
                                {b2bSaving ? 'Working…' : "Generate this month's bill"}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

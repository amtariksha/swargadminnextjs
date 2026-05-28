'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { POST } from '@/lib/api';
import { ArrowLeft, UserPlus } from 'lucide-react';
import FormField, { inputClassName } from '@/components/FormField';
import { toast } from 'sonner';

export default function AddUserPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', phone: '' });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const errs: Record<string, string> = {};
        if (!form.name.trim()) errs.name = 'Name is required';
        if (!form.phone.trim() && !form.email.trim()) errs.phone = 'Phone or Email is required';
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setIsSubmitting(true);
        try {
            const payload: Record<string, string> = { name: form.name.trim() };
            if (form.phone.trim()) payload.phone = form.phone.trim();
            if (form.email.trim()) payload.email = form.email.trim();

            const res = await POST<{ response: number; message: string }>('/add_user', payload);
            if (res.response === 200) {
                toast.success('User added successfully');
                router.push('/users');
            } else {
                toast.error(res.message || 'Failed to add user');
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to add user');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white">Add User</h1>
                    <p className="text-slate-400">Create a new customer account</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-6 max-w-lg">
                <FormField label="Name" error={errors.name ? { message: errors.name } as never : undefined} required>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={inputClassName} placeholder="Full name" autoFocus />
                </FormField>

                <FormField label="Phone" error={errors.phone ? { message: errors.phone } as never : undefined}>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                        className={inputClassName} placeholder="Phone number" inputMode="tel" />
                </FormField>

                <FormField label="Email" error={errors.email ? { message: errors.email } as never : undefined}>
                    <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                        type="email" className={inputClassName} placeholder="Email (optional if phone provided)" />
                </FormField>

                <p className="text-xs text-slate-500">Either phone or email is required.</p>

                <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                    <button type="button" onClick={() => router.back()}
                        className="px-6 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl hover:bg-slate-800">Cancel</button>
                    <button type="submit" disabled={isSubmitting}
                        className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50">
                        <UserPlus className="w-4 h-4" />
                        {isSubmitting ? 'Adding...' : 'Add User'}
                    </button>
                </div>
            </form>
        </div>
    );
}

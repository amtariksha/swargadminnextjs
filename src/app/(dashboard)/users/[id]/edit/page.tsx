'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useUpdateUser } from '@/hooks/useData';
import FormField, { inputClassName } from '@/components/FormField';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

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
        } catch {
            toast.error('Failed to update user');
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
        </div>
    );
}

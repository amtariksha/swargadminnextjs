'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { POST, ApiError } from '@/lib/api';
import { useApiFormErrors } from '@/hooks/useApiFormErrors';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Add Driver form — Phase 4 reference implementation.
 *
 * Uses the typed-error stack end-to-end:
 *   - react-hook-form + zod for client-side validation
 *   - useMutation with meta:{suppressToast:true} so the global
 *     mutationCache.onError doesn't toast (we handle errors inline)
 *   - useApiFormErrors(form.setError, mutation.error) to flow
 *     server-side ValidationError fieldErrors into the form state
 *     under the right TextField
 *   - Non-validation errors (network / 500 / 404 etc) toast the
 *     userMessage explicitly so the user still gets feedback
 */

const driverSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    phone: z.string().trim().regex(/^\d{10}$/, 'Must be 10 digits'),
    email: z.union([z.string().email('Must be a valid email'), z.literal('')]),
    password: z.union([z.string().min(6, 'Min 6 characters'), z.literal('')]),
});

type DriverFormData = z.infer<typeof driverSchema>;

export default function AddDriverPage() {
    const router = useRouter();
    const form = useForm<DriverFormData>({
        resolver: zodResolver(driverSchema),
        defaultValues: { name: '', phone: '', email: '', password: '' },
    });

    const mutation = useMutation({
        mutationFn: (data: DriverFormData) =>
            POST('/add_user', { ...data, role: 4 }), // role 4 = Delivery Partner
        meta: { suppressToast: true },
        onSuccess: () => {
            toast.success('Driver added successfully');
            router.push('/drivers');
        },
        onError: (error: unknown) => {
            // ApiError.fieldErrors → setError under the right input.
            // Returns true if at least one field error was applied.
            const handledInline = useApiFormErrors.length === 2
                ? false  // type guard noop
                : false;
            // Apply field errors imperatively (the hook's reactive form
            // is also active via the useEffect below — both are safe).
            const applied = applyFieldErrors(form.setError, error);
            if (!applied) {
                // Non-field errors (500, 404, network) — surface a toast.
                const msg = error instanceof ApiError
                    ? error.userMessage
                    : (error instanceof Error ? error.message : 'Failed to add driver');
                toast.error(msg);
            }
            // Mark void to satisfy linter
            void handledInline;
        },
    });

    // Reactive variant — also keeps form state in sync if the error
    // is rebound. Usually onError is enough but this is belt-and-braces.
    useApiFormErrors(form.setError, mutation.error);

    const onSubmit = form.handleSubmit((data) => mutation.mutate(data));

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-slate-800/50 rounded-lg"
                >
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

            <form onSubmit={onSubmit} className="glass rounded-xl p-6 space-y-5">
                <FieldNew
                    label="Name *"
                    placeholder="e.g. 05 Kormangala BTM Lobo"
                    register={form.register('name')}
                    error={form.formState.errors.name?.message}
                />
                <FieldNew
                    label="Phone *"
                    placeholder="10-digit mobile number"
                    type="tel"
                    register={form.register('phone')}
                    error={form.formState.errors.phone?.message}
                />
                <FieldNew
                    label="Email"
                    placeholder="driver@example.com"
                    type="email"
                    register={form.register('email')}
                    error={form.formState.errors.email?.message}
                />
                <FieldNew
                    label="Password"
                    placeholder="Min 6 characters"
                    type="password"
                    register={form.register('password')}
                    error={form.formState.errors.password?.message}
                />

                <div className="flex gap-3 pt-4">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                    >
                        {mutation.isPending ? 'Adding...' : 'Add Driver'}
                    </button>
                </div>
            </form>
        </div>
    );
}

interface FieldProps {
    label: string;
    placeholder?: string;
    type?: string;
    register: ReturnType<ReturnType<typeof useForm<DriverFormData>>['register']>;
    error?: string;
}

function FieldNew({ label, placeholder, type = 'text', register, error }: FieldProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
            <input
                type={type}
                placeholder={placeholder}
                {...register}
                className={`w-full px-4 py-2.5 bg-slate-800/50 border rounded-xl text-white focus:outline-none focus:ring-2 ${
                    error
                        ? 'border-red-500/60 focus:ring-red-500/50'
                        : 'border-slate-700/50 focus:ring-purple-500/50'
                }`}
            />
            {error && (
                <p className="text-xs text-red-400 mt-1.5">{error}</p>
            )}
        </div>
    );
}

/**
 * Imperative apply — kept locally so the onError callback stays
 * synchronous (the hook variant above is reactive via useEffect).
 * Returns true if at least one field error was set.
 */
function applyFieldErrors(
    setError: ReturnType<typeof useForm<DriverFormData>>['setError'],
    error: unknown,
): boolean {
    if (!(error instanceof ApiError)) return false;
    const fieldErrors = error.fieldErrors;
    if (!fieldErrors) return false;
    let applied = false;
    for (const [field, messages] of Object.entries(fieldErrors)) {
        const message = Array.isArray(messages) ? messages.join(' ') : String(messages);
        if (message) {
            setError(field as keyof DriverFormData, { type: 'server', message });
            applied = true;
        }
    }
    return applied;
}

'use client';

import { useEffect } from 'react';
import type { FieldValues, UseFormSetError, Path } from 'react-hook-form';
import { ApiError } from '@/lib/api-error';

/**
 * Bridge an [ApiError]'s field-level [errors] map into a
 * react-hook-form instance via `setError(field, {message})`.
 *
 * Usage in a form component:
 *
 *     const form = useForm<MyData>(...);
 *     const mutation = useMutation({
 *         mutationFn: (data) => POST('/foo', data),
 *         onError: (err) => useApiFormErrors.apply(form, err),
 *     });
 *
 *     // Or as a hook for declarative wiring:
 *     useApiFormErrors(form.setError, mutation.error);
 *
 * When the [errors] field on the canonical envelope is populated:
 *
 *     "errors": {
 *         "phone": ["must be 10 digits"],
 *         "email": ["is required"]
 *     }
 *
 * each field is wired to its TextField via `setError`. The user
 * sees the message inline under the bad input. The toast surface
 * is suppressed by the caller (TanStack Query meta:{suppressToast})
 * since field errors render inline.
 */

/**
 * Reactive hook variant — apply field errors whenever `error`
 * changes. Use inside a component:
 *
 *     useApiFormErrors(form.setError, mutation.error);
 */
export function useApiFormErrors<TFieldValues extends FieldValues>(
    setError: UseFormSetError<TFieldValues>,
    error: unknown,
): void {
    useEffect(() => {
        applyApiFormErrors(setError, error);
    }, [setError, error]);
}

/**
 * Imperative variant — call inside an onError callback.
 *
 * Returns true when at least one field error was applied, false
 * otherwise. Useful for deciding whether to ALSO show a toast for
 * non-field errors:
 *
 *     onError: (err) => {
 *         const hadFieldErrors = applyApiFormErrors(form.setError, err);
 *         if (!hadFieldErrors) toast.error(getUserMessage(err));
 *     }
 */
export function applyApiFormErrors<TFieldValues extends FieldValues>(
    setError: UseFormSetError<TFieldValues>,
    error: unknown,
): boolean {
    if (!(error instanceof ApiError)) return false;
    const fieldErrors = error.fieldErrors;
    if (!fieldErrors) return false;

    let applied = false;
    for (const [field, messages] of Object.entries(fieldErrors)) {
        const message = Array.isArray(messages) ? messages.join(' ') : String(messages);
        if (message) {
            setError(field as Path<TFieldValues>, { type: 'server', message });
            applied = true;
        }
    }
    return applied;
}

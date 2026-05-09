/**
 * Unit tests for src/hooks/useApiFormErrors.ts.
 *
 * Tests the imperative `applyApiFormErrors` helper directly since
 * it doesn't require a React render. The reactive `useApiFormErrors`
 * hook wraps this in a useEffect; its behaviour is identical.
 */

import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '../src/lib/api-error';
import { applyApiFormErrors } from '../src/hooks/useApiFormErrors';

describe('applyApiFormErrors', () => {
  it('returns false when error is not an ApiError', () => {
    const setError = vi.fn();
    const ok = applyApiFormErrors(setError, new Error('plain'));
    expect(ok).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it('returns false when ApiError has no fieldErrors', () => {
    const setError = vi.fn();
    const err = new ApiError({
      status: 500, userMessage: 'Server', requestId: 'r', envelope: {},
    });
    const ok = applyApiFormErrors(setError, err);
    expect(ok).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it('calls setError once per field with joined messages', () => {
    const setError = vi.fn();
    const err = new ApiError({
      status: 400, userMessage: 'Validation failed', requestId: 'r', envelope: {},
      fieldErrors: {
        phone: ['must be 10 digits'],
        email: ['is required', 'must be valid'],
      },
    });
    const ok = applyApiFormErrors(setError, err);
    expect(ok).toBe(true);
    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenCalledWith('phone', { type: 'server', message: 'must be 10 digits' });
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'is required must be valid' });
  });

  it('skips fields with empty message arrays', () => {
    const setError = vi.fn();
    const err = new ApiError({
      status: 400, userMessage: 'Validation failed', requestId: 'r', envelope: {},
      fieldErrors: {
        phone: [],
        email: ['is required'],
      },
    });
    const ok = applyApiFormErrors(setError, err);
    expect(ok).toBe(true);
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'is required' });
  });

  it('handles a single-string value (defensively coerces)', () => {
    const setError = vi.fn();
    const err = new ApiError({
      status: 400, userMessage: 'Validation failed', requestId: 'r', envelope: {},
      fieldErrors: {
        // Per the contract this should be string[] but defensive code
        // should still apply when a non-array slips through.
        phone: 'must be 10 digits' as unknown as string[],
      },
    });
    const ok = applyApiFormErrors(setError, err);
    expect(ok).toBe(true);
    expect(setError).toHaveBeenCalledWith('phone', { type: 'server', message: 'must be 10 digits' });
  });
});

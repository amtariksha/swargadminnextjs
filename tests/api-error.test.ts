/**
 * Unit tests for src/lib/api-error.ts.
 *
 * Run with: npm run test:units
 *
 * Tests the AxiosError → ApiError conversion contract used by the
 * axios interceptor in src/lib/api.ts. Identical logic ships in
 * desicowmilkweb and multiappadmin (with fetch instead of axios) so
 * the same coverage applies transitively.
 */

import { describe, it, expect } from 'vitest';
import type { AxiosError, AxiosResponse } from 'axios';
import { ApiError, apiErrorFromResponse, parseApiError } from '../src/lib/api-error';

function makeAxiosError(
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
): AxiosError {
  const response: Partial<AxiosResponse> = {
    status,
    data,
    headers: headers as unknown as AxiosResponse['headers'],
  };
  const err = new Error('Request failed') as AxiosError;
  err.isAxiosError = true;
  err.response = response as AxiosResponse;
  return err;
}

describe('ApiError class', () => {
  it('exposes status code as the .status field', () => {
    const e = new ApiError({ status: 422, userMessage: 'x', requestId: 'r', envelope: {} });
    expect(e.status).toBe(422);
    expect(e.userMessage).toBe('x');
    expect(e.requestId).toBe('r');
  });

  it('isAuth/isValidation/isRateLimit/isTransient/isNotFound/isConflict', () => {
    const mk = (status: number) =>
      new ApiError({ status, userMessage: '', requestId: 'r', envelope: {} });
    expect(mk(401).isAuth).toBe(true);
    expect(mk(401).isValidation).toBe(false);
    expect(mk(400).isValidation).toBe(true);
    expect(mk(422).isValidation).toBe(true);
    expect(mk(429).isRateLimit).toBe(true);
    expect(mk(500).isTransient).toBe(true);
    expect(mk(0).isTransient).toBe(true);
    expect(mk(404).isNotFound).toBe(true);
    expect(mk(409).isConflict).toBe(true);
  });

  it('isTokenExpired distinguishes real auth failure from generic 401', () => {
    const tokenExpired = new ApiError({
      status: 401, userMessage: '', requestId: 'r',
      envelope: { code: 'token_expired' }, code: 'token_expired',
    });
    const insufficientRole = new ApiError({
      status: 401, userMessage: '', requestId: 'r',
      envelope: { code: 'insufficient_role' }, code: 'insufficient_role',
    });
    expect(tokenExpired.isTokenExpired).toBe(true);
    expect(insufficientRole.isTokenExpired).toBe(false);
  });

  it('extends Error so instanceof Error works in legacy catch chains', () => {
    const e = new ApiError({ status: 500, userMessage: 'oops', requestId: 'r', envelope: {} });
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('oops');
  });
});

describe('parseApiError — non-axios paths', () => {
  it('passes through an existing ApiError unchanged', () => {
    const original = new ApiError({
      status: 422, userMessage: 'wallet low', requestId: 'r', envelope: {},
    });
    expect(parseApiError(original)).toBe(original);
  });

  it('synthesises network_error when there is no response', () => {
    const noResponse = { message: 'fetch failed' } as AxiosError;
    const e = parseApiError(noResponse);
    expect(e.status).toBe(0);
    expect(e.code).toBe('network_error');
    expect(e.userMessage).toContain('No internet');
  });

  it('synthesises a timeout when ECONNABORTED', () => {
    const timeoutErr = { code: 'ECONNABORTED' } as unknown as AxiosError;
    const e = parseApiError(timeoutErr);
    expect(e.status).toBe(0);
    expect(e.userMessage).toContain('timed out');
  });
});

describe('apiErrorFromResponse — canonical envelope', () => {
  it('extracts validation_failed with errors map', () => {
    const e = apiErrorFromResponse({
      status: 400,
      data: {
        statusCode: 400,
        error: 'ValidationError',
        message: 'Validation failed',
        code: 'validation_failed',
        errors: {
          phone: ['must be 10 digits'],
          email: ['is required', 'must be valid'],
        },
        request_id: '9f2c1c6e-41bc-4eaa-b5d1-2e9f8a3a7b88',
        timestamp: '2026-05-09T08:00:00Z',
        response: 400,
        status: false,
        data: null,
      },
      headers: {},
    });

    expect(e.status).toBe(400);
    expect(e.code).toBe('validation_failed');
    expect(e.userMessage).toBe('Validation failed');
    expect(e.requestId).toBe('9f2c1c6e-41bc-4eaa-b5d1-2e9f8a3a7b88');
    expect(e.fieldErrors).toEqual({
      phone: ['must be 10 digits'],
      email: ['is required', 'must be valid'],
    });
    expect(e.isValidation).toBe(true);
  });

  it('extracts wallet_insufficient with details', () => {
    const e = apiErrorFromResponse({
      status: 422,
      data: {
        statusCode: 422,
        message: 'Wallet balance is insufficient for this order',
        code: 'wallet_insufficient',
        details: { available: 50, required: 1299, currency: 'INR' },
        request_id: 'rid',
      },
      headers: {},
    });
    expect(e.code).toBe('wallet_insufficient');
    expect(e.details).toEqual({ available: 50, required: 1299, currency: 'INR' });
    expect(e.userMessage).toContain('Wallet balance');
  });

  it('rate_limited reads retry_after_seconds from body', () => {
    const e = apiErrorFromResponse({
      status: 429,
      data: {
        statusCode: 429, code: 'rate_limited', message: 'Too many',
        retry_after_seconds: 47, request_id: 'rid',
      },
      headers: {},
    });
    expect(e.retryAfterSeconds).toBe(47);
    expect(e.isRateLimit).toBe(true);
  });

  it('rate_limited falls back to Retry-After header when body lacks it', () => {
    const e = apiErrorFromResponse({
      status: 429,
      data: { message: 'Too many', request_id: 'rid' },
      headers: { 'retry-after': '90' },
    });
    expect(e.retryAfterSeconds).toBe(90);
  });

  it('joins message:string[] with newline', () => {
    const e = apiErrorFromResponse({
      status: 400,
      data: {
        message: ['must include @', 'at least 8 chars'],
        code: 'validation_failed',
        request_id: 'rid',
      },
      headers: {},
    });
    expect(e.userMessage).toBe('must include @\nat least 8 chars');
  });

  it('legacy "error" placeholder triggers default message', () => {
    const e = apiErrorFromResponse({
      status: 500,
      data: { message: 'error', response: 500, request_id: 'rid' },
      headers: {},
    });
    expect(e.userMessage).not.toBe('error');
    expect(e.userMessage).toContain('Server error');
  });

  it('falls back to default message when message is missing', () => {
    const e = apiErrorFromResponse({
      status: 401,
      data: { request_id: 'rid' },
      headers: {},
    });
    expect(e.userMessage).toContain('log in again');
  });
});

describe('apiErrorFromResponse — legacy envelope (no canonical)', () => {
  it('parses Laravel-style {response, status, message, data}', () => {
    const e = apiErrorFromResponse({
      status: 404,
      data: {
        response: 404,
        status: false,
        message: 'Order not found',
        data: null,
      },
      headers: {},
    });
    expect(e.status).toBe(404);
    expect(e.userMessage).toBe('Order not found');
    expect(e.code).toBeUndefined();
    expect(e.requestId).toBe('no-request-id');
  });

  it('reads X-Request-ID from headers when body lacks request_id', () => {
    const e = apiErrorFromResponse({
      status: 500,
      data: { response: 500, message: 'oops' },
      headers: { 'x-request-id': 'header-rid' },
    });
    expect(e.requestId).toBe('header-rid');
  });
});

describe('apiErrorFromResponse — non-JSON body', () => {
  it('plain string (HTML proxy page) gets default message', () => {
    const e = apiErrorFromResponse({
      status: 502,
      data: '<html>Bad Gateway</html>',
      headers: {},
    });
    expect(e.status).toBe(502);
    expect(e.userMessage).toContain('Server error');
  });

  it('valid JSON inside string body is parsed', () => {
    const e = apiErrorFromResponse({
      status: 400,
      data: '{"message":"bad input","code":"validation_failed","request_id":"rid"}',
      headers: {},
    });
    expect(e.code).toBe('validation_failed');
    expect(e.userMessage).toBe('bad input');
  });

  it('null body gets default message', () => {
    const e = apiErrorFromResponse({
      status: 503,
      data: null,
      headers: {},
    });
    expect(e.status).toBe(503);
    expect(e.userMessage).toContain('Server error');
  });
});

describe('default messages by status', () => {
  const cases: [number, string][] = [
    [401, 'log in again'],
    [403, 'permission'],
    [404, 'Not found'],
    [409, 'Conflict'],
    [422, 'invalid'],
    [429, 'Too many requests'],
    [500, 'Server error'],
    [503, 'Server error'],
    [0, 'No internet'],
  ];
  for (const [status, expected] of cases) {
    it(`status ${status} → contains "${expected}"`, () => {
      const e = apiErrorFromResponse({ status, data: {}, headers: {} });
      expect(e.userMessage.toLowerCase()).toContain(expected.toLowerCase());
    });
  }
});

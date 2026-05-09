/**
 * Typed ApiError for the Swarg admin Next.js app.
 *
 * Mirrors the canonical envelope from
 * `swargnodejsbackend/docs/error-envelope.md`. Thrown by the
 * axios response interceptor on every non-2xx (and on 200 + legacy
 * `response: 201` business-error). Consumers do
 * `instanceof ApiError` and branch on `.code` / `.fieldErrors` /
 * `.isAuth` / `.isTransient` / etc.
 *
 * Default UX rules:
 *   - mutations.onError → toast(err.userMessage)  (TanStack Query default)
 *   - queries with `meta: {suppressToast: true}` skip the toast
 *   - forms with field-level errors call useApiFormErrors(form, err)
 *   - code-specific UI branches in the component (see Phase 4)
 */

import type { AxiosError, AxiosResponse } from 'axios';

export interface ApiErrorEnvelope {
  // Canonical
  statusCode?: number;
  error?: string;
  message?: string | string[];
  code?: string;
  errors?: Record<string, string[]>;
  details?: Record<string, unknown>;
  retry_after_seconds?: number;
  request_id?: string;
  timestamp?: string;
  // Legacy (compat window)
  response?: number;
  status?: boolean;
  data?: unknown;
}

export class ApiError extends Error {
  /** HTTP status code, or 0 when the request never reached the server. */
  readonly status: number;
  /** Stable snake_case slug — see error-envelope.md registry. */
  readonly code?: string;
  /** Flattened single-string message safe for any UI surface. */
  readonly userMessage: string;
  /** Field-level errors (form name → message[]). */
  readonly fieldErrors?: Record<string, string[]>;
  /** Code-specific extra context. */
  readonly details?: Record<string, unknown>;
  /** 429 only. */
  readonly retryAfterSeconds?: number;
  /** UUIDv4 (or upstream LB id). */
  readonly requestId: string;
  /** Raw envelope. Useful for telemetry / diagnostics. */
  readonly envelope: ApiErrorEnvelope;

  constructor(args: {
    status: number;
    userMessage: string;
    requestId: string;
    envelope: ApiErrorEnvelope;
    code?: string;
    fieldErrors?: Record<string, string[]>;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
  }) {
    super(args.userMessage);
    this.name = 'ApiError';
    this.status = args.status;
    this.code = args.code;
    this.userMessage = args.userMessage;
    this.fieldErrors = args.fieldErrors;
    this.details = args.details;
    this.retryAfterSeconds = args.retryAfterSeconds;
    this.requestId = args.requestId;
    this.envelope = args.envelope;
  }

  get isAuth() { return this.status === 401; }
  get isValidation() { return this.status === 400 || this.status === 422; }
  get isRateLimit() { return this.status === 429; }
  get isTransient() { return this.status >= 500 || this.status === 0; }
  get isNotFound() { return this.status === 404; }
  get isConflict() { return this.status === 409; }

  /** Distinguish "real session expired" from "any 4xx" so we don't
   *  bounce the user to /login on every business error. */
  get isTokenExpired() {
    return this.code === 'token_expired' || this.code === 'token_invalid';
  }
}

/**
 * Convert an AxiosError (or anything else thrown inside an axios
 * call) into a typed ApiError.
 */
export function parseApiError(error: unknown): ApiError {
  // Already typed.
  if (error instanceof ApiError) return error;

  // Network failure / no response.
  const axErr = error as AxiosError | undefined;
  const response = axErr?.response;
  if (!response) {
    const isTimeout = (axErr as { code?: string } | undefined)?.code === 'ECONNABORTED';
    return new ApiError({
      status: 0,
      code: 'network_error',
      userMessage: isTimeout
        ? 'Request timed out. Please try again.'
        : 'No internet connection. Please check your network.',
      requestId: 'no-response',
      envelope: {},
    });
  }

  return apiErrorFromResponse(response);
}

/**
 * Build an ApiError from an axios response object directly (useful
 * for the legacy "HTTP 200 + response: 201" business-error path
 * where Axios doesn't throw).
 */
export function apiErrorFromResponse(response: AxiosResponse | { status: number; data: unknown; headers?: Record<string, string> }): ApiError {
  const status = response.status ?? 0;

  // Decode body shape.
  let body: ApiErrorEnvelope = {};
  const raw = response.data;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    body = raw as ApiErrorEnvelope;
  } else if (typeof raw === 'string') {
    try {
      const decoded = JSON.parse(raw);
      if (decoded != null && typeof decoded === 'object') {
        body = decoded as ApiErrorEnvelope;
      }
    } catch {
      // HTML proxy page or plain text — fall through.
    }
  }

  const requestId =
    body.request_id ??
    (response.headers as Record<string, string> | undefined)?.['x-request-id'] ??
    'no-request-id';

  // Flatten string|string[] message.
  let userMessage: string;
  const rawMsg = body.message;
  if (Array.isArray(rawMsg)) {
    userMessage = rawMsg.join('\n');
  } else if (typeof rawMsg === 'string' && rawMsg.length > 0 &&
             !rawMsg.toLowerCase().startsWith('error')) {
    userMessage = rawMsg;
  } else {
    userMessage = defaultMessageForStatus(status);
  }

  // Retry-after.
  let retryAfterSeconds: number | undefined = body.retry_after_seconds;
  if (retryAfterSeconds == null) {
    const headerVal = (response.headers as Record<string, string> | undefined)?.['retry-after'];
    const parsed = headerVal != null ? parseInt(headerVal, 10) : NaN;
    if (Number.isFinite(parsed)) retryAfterSeconds = parsed;
  }

  return new ApiError({
    status,
    code: body.code,
    userMessage,
    fieldErrors: body.errors,
    details: body.details,
    retryAfterSeconds,
    requestId,
    envelope: body,
  });
}

function defaultMessageForStatus(status: number): string {
  if (status === 401) return 'Please log in again.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return 'Not found.';
  if (status === 409) return 'Conflict — try refreshing.';
  if (status === 422) return 'Some fields are invalid.';
  if (status === 429) return 'Too many requests. Please wait and try again.';
  if (status >= 500) return 'Server error. Please try again in a moment.';
  if (status === 0) return 'No internet connection. Please check your network.';
  return 'Something went wrong. Please try again.';
}

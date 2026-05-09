import axios, { AxiosInstance, AxiosError } from 'axios';
import { getApiUrl } from '@/config/tenant';
import { ApiError, apiErrorFromResponse, parseApiError } from './api-error';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
    baseURL: getApiUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
    (config) => {
        if (typeof window !== 'undefined') {
            const admin = localStorage.getItem('admin');
            if (admin) {
                try {
                    const parsed = JSON.parse(admin);
                    if (parsed?.token) {
                        config.headers.Authorization = `Bearer ${parsed.token}`;
                    }
                } catch {
                    localStorage.removeItem('admin');
                }
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

/**
 * Response interceptor for error handling.
 *
 * Phase 3 of the error rollout:
 *   - Parses every non-2xx response into a typed [ApiError]
 *     (via parseApiError → apiErrorFromResponse).
 *   - 401 → /login redirect ONLY when the typed `code` is
 *     `token_expired` or `token_invalid`. Other 401s (e.g.
 *     `insufficient_role`) bubble up so the screen can render
 *     "you don't have access" inline.
 *   - 5xx blips and network errors no longer bounce to login —
 *     they propagate so the caller can show a banner + retry.
 *
 * The string-match heuristic (`includes('expired')` etc.) survives
 * as a fallback for legacy endpoints that haven't gained the
 * canonical `code` field yet.
 */
apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        const apiError = parseApiError(error);

        if (typeof window !== 'undefined' &&
            apiError.status === 401 &&
            !window.location.pathname.includes('/login')) {

            const hadToken = error.config?.headers?.Authorization?.toString().startsWith('Bearer ');

            // Prefer the typed `code` field; fall back to string match.
            const legacyMessage = (apiError.envelope.message as string | undefined ?? '').toLowerCase();
            const isTokenInvalid = apiError.isTokenExpired ||
                legacyMessage.includes('expired') ||
                legacyMessage.includes('invalid token') ||
                legacyMessage.includes('jwt') ||
                legacyMessage.includes('malformed');

            if (hadToken && isTokenInvalid) {
                localStorage.removeItem('admin');
                window.location.href = '/login';
            }
        }

        return Promise.reject(apiError);
    }
);

// Generic GET request
export const GET = async <T = unknown>(
    endpoint: string,
    params?: Record<string, unknown>
): Promise<{ data: T; message?: string }> => {
    const response = await apiClient.get<{ data: T; message?: string }>(endpoint, { params });
    return response.data;
};

/**
 * Check backend business-logic errors (HTTP 200 but response code != 200).
 *
 * Phase 3 — throws a real [ApiError] instead of a plain Error so
 * the rest of the app can do `instanceof ApiError` consistently.
 */
function checkBusinessError(
    result: {
        response?: number;
        status?: boolean;
        message?: string | string[];
        code?: string;
        errors?: Record<string, string[]>;
        details?: Record<string, unknown>;
        request_id?: string;
        statusCode?: number;
    } | undefined,
    httpStatus: number,
    headers: Record<string, string>,
) {
    if (!result) return;
    const inBandStatus = result.statusCode ?? result.response;
    if (inBandStatus != null && inBandStatus !== 200 && inBandStatus < 300) {
        // HTTP 200 carrying an in-band failure (legacy response:201).
        // Rebuild the ApiError as if the HTTP layer had thrown.
        throw apiErrorFromResponse({
            status: inBandStatus,
            data: result,
            headers,
        });
    }
    if (result.status === false) {
        throw apiErrorFromResponse({
            status: inBandStatus ?? httpStatus,
            data: result,
            headers,
        });
    }
}

// Generic POST request
export const POST = async <T = unknown>(
    endpoint: string,
    data?: Record<string, unknown> | FormData
): Promise<{ data: T; message?: string; response?: number }> => {
    // For FormData, delete Content-Type so browser sets multipart/form-data with boundary
    const config = data instanceof FormData
        ? { headers: { 'Content-Type': undefined } }
        : {};
    const response = await apiClient.post<{ data: T; message?: string; response?: number }>(
        endpoint,
        data,
        config
    );
    const result = response.data;
    checkBusinessError(result, response.status, response.headers as Record<string, string>);
    return result;
};

// Generic PUT request
export const PUT = async <T = unknown>(
    endpoint: string,
    data?: Record<string, unknown> | FormData
): Promise<{ data: T; message?: string }> => {
    // For FormData, delete Content-Type so browser sets multipart/form-data with boundary
    const config = data instanceof FormData ? { headers: { 'Content-Type': undefined } } : {};
    const response = await apiClient.put<{ data: T; message?: string }>(endpoint, data, config);
    const result = response.data;
    checkBusinessError(result, response.status, response.headers as Record<string, string>);
    return result;
};

// Generic DELETE request
export const DELETE = async <T = unknown>(
    endpoint: string,
    data?: Record<string, unknown>
): Promise<{ data: T; message?: string }> => {
    const response = await apiClient.delete<{ data: T; message?: string }>(endpoint, { data });
    const result = response.data as { response?: number; status?: boolean };
    checkBusinessError(result, response.status, response.headers as Record<string, string>);
    return response.data;
};

// Re-export typed error class so consumers can import from one place.
export { ApiError };

export default apiClient;

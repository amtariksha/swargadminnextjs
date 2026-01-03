import axios, { AxiosInstance, AxiosError } from 'axios';
import { getApiUrl } from '@/config/tenant';

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
            const admin = sessionStorage.getItem('admin');
            if (admin) {
                try {
                    const parsed = JSON.parse(admin);
                    if (parsed?.token) {
                        config.headers.Authorization = `Bearer ${parsed.token}`;
                        console.log('[API] Token attached to request:', config.url);
                    } else {
                        console.warn('[API] No token in admin object for:', config.url);
                    }
                } catch (e) {
                    console.error('[API] Failed to parse admin from sessionStorage:', e);
                }
            } else {
                console.warn('[API] No admin in sessionStorage for:', config.url);
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        // Only redirect to login for genuine authentication failures
        if (error.response?.status === 401) {
            const errorData = error.response.data as { message?: string; error?: string } | undefined;
            const errorMessage = (errorData?.message || errorData?.error || '').toLowerCase();

            console.warn('[API] 401 Error:', errorMessage, 'for:', error.config?.url);

            // Check if token was actually in the request
            const hadToken = error.config?.headers?.Authorization?.toString().startsWith('Bearer ');

            // Only logout if:
            // 1. Token WAS sent but was invalid/expired
            // 2. NOT when token is simply missing (frontend issue)
            const isTokenInvalidOrExpired =
                errorMessage.includes('expired') ||
                errorMessage.includes('invalid token') ||
                errorMessage.includes('jwt') ||
                errorMessage.includes('malformed');

            // "Access token required" means token wasn't sent - don't logout, just log the error
            const isTokenMissing = errorMessage.includes('required') || errorMessage.includes('missing');

            const isLoginPage = typeof window !== 'undefined' &&
                window.location.pathname.includes('/login');

            if (hadToken && isTokenInvalidOrExpired && !isLoginPage && typeof window !== 'undefined') {
                console.warn('[API] Token invalid/expired, redirecting to login');
                sessionStorage.removeItem('admin');
                window.location.href = '/login';
            } else if (isTokenMissing) {
                console.error('[API] Token was not sent with request - this is a frontend issue');
            }
        }
        return Promise.reject(error);
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

// Generic POST request
export const POST = async <T = unknown>(
    endpoint: string,
    data?: Record<string, unknown> | FormData
): Promise<{ data: T; message?: string; response?: number }> => {
    const config = data instanceof FormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : {};
    const response = await apiClient.post<{ data: T; message?: string; response?: number }>(
        endpoint,
        data,
        config
    );
    return response.data;
};

// Generic PUT request
export const PUT = async <T = unknown>(
    endpoint: string,
    data?: Record<string, unknown> | FormData
): Promise<{ data: T; message?: string }> => {
    const config = data instanceof FormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : {};
    const response = await apiClient.put<{ data: T; message?: string }>(endpoint, data, config);
    return response.data;
};

// Generic DELETE request
export const DELETE = async <T = unknown>(
    endpoint: string,
    data?: Record<string, unknown>
): Promise<{ data: T; message?: string }> => {
    const response = await apiClient.delete<{ data: T; message?: string }>(endpoint, { data });
    return response.data;
};

export default apiClient;

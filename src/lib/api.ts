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
                    }
                } catch {
                    // Invalid JSON in sessionStorage
                }
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
        // Check if it's an auth-related 401 (token expired/invalid)
        if (error.response?.status === 401) {
            const errorData = error.response.data as { message?: string; error?: string } | undefined;
            const errorMessage = errorData?.message || errorData?.error || '';

            // Only logout if the error message indicates an actual auth failure
            const isAuthFailure =
                errorMessage.toLowerCase().includes('token') ||
                errorMessage.toLowerCase().includes('unauthorized') ||
                errorMessage.toLowerCase().includes('authentication') ||
                errorMessage.toLowerCase().includes('jwt') ||
                errorMessage.toLowerCase().includes('expired') ||
                errorMessage.toLowerCase().includes('invalid');

            // Also check if we're already on the login page to prevent loops
            const isLoginPage = typeof window !== 'undefined' &&
                window.location.pathname.includes('/login');

            if (isAuthFailure && !isLoginPage && typeof window !== 'undefined') {
                console.warn('Auth failure detected, redirecting to login:', errorMessage);
                sessionStorage.removeItem('admin');
                window.location.href = '/login';
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

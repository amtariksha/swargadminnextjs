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

// Response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        if (error.response?.status === 401) {
            const errorData = error.response.data as { message?: string; error?: string } | undefined;
            const errorMessage = (errorData?.message || errorData?.error || '').toLowerCase();

            const hadToken = error.config?.headers?.Authorization?.toString().startsWith('Bearer ');
            const isTokenInvalidOrExpired =
                errorMessage.includes('expired') ||
                errorMessage.includes('invalid token') ||
                errorMessage.includes('jwt') ||
                errorMessage.includes('malformed');

            const isLoginPage = typeof window !== 'undefined' &&
                window.location.pathname.includes('/login');

            if (hadToken && isTokenInvalidOrExpired && !isLoginPage && typeof window !== 'undefined') {
                localStorage.removeItem('admin');
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

// Check backend business logic errors (HTTP 200 but response code != 200)
function checkBusinessError(result: { response?: number; status?: boolean; message?: string }) {
    if (result.response && result.response !== 200) {
        const error = new Error(result.message || 'Operation failed');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).serverResponse = result;
        throw error;
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
    checkBusinessError(result);
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
    checkBusinessError(result);
    return result;
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

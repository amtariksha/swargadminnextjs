'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { POST } from '@/lib/api';

interface AdminUser {
    id: number;
    email: string;
    role: Array<{ role_title: string }>;
    token: string;
}

interface AuthContextType {
    admin: AdminUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [admin, setAdmin] = useState<AdminUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    // Load admin from sessionStorage on mount
    useEffect(() => {
        const stored = sessionStorage.getItem('admin');
        if (stored) {
            try {
                setAdmin(JSON.parse(stored));
            } catch {
                sessionStorage.removeItem('admin');
            }
        }
        setIsLoading(false);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const response = await POST<AdminUser>('/login', { email, password });

        if (response.response === 200 && response.data) {
            const adminData = response.data;
            sessionStorage.setItem('admin', JSON.stringify(adminData));
            setAdmin(adminData);
            router.push('/');
        } else {
            throw new Error(response.message || 'Login failed');
        }
    }, [router]);

    const logout = useCallback(() => {
        sessionStorage.removeItem('admin');
        setAdmin(null);
        router.push('/login');
    }, [router]);

    return (
        <AuthContext.Provider
            value={{
                admin,
                isLoading,
                isAuthenticated: !!admin,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

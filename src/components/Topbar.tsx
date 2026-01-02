'use client';

import { useAuth } from '@/lib/auth';
import { Menu, LogOut, User, Bell } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface TopbarProps {
    onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
    const { admin, logout } = useAuth();
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getInitials = (email: string) => {
        return email?.charAt(0).toUpperCase() || 'A';
    };

    return (
        <header className="sticky top-0 z-30 h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/50 px-4 lg:px-6">
            <div className="h-full flex items-center justify-between">
                {/* Left side */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onMenuClick}
                        className="lg:hidden p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
                    >
                        <Menu className="w-5 h-5 text-slate-400" />
                    </button>

                    <div className="hidden sm:block">
                        <h2 className="text-lg font-semibold text-white">Dashboard</h2>
                        <p className="text-xs text-slate-400">Welcome back!</p>
                    </div>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    {/* Notifications */}
                    <button className="relative p-2.5 hover:bg-slate-800/50 rounded-xl transition-colors">
                        <Bell className="w-5 h-5 text-slate-400" />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-purple-500 rounded-full" />
                    </button>

                    {/* User dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="flex items-center gap-3 p-2 hover:bg-slate-800/50 rounded-xl transition-colors"
                        >
                            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                {getInitials(admin?.email || '')}
                            </div>
                            <div className="hidden md:block text-left">
                                <p className="text-sm font-medium text-white truncate max-w-[120px]">
                                    {admin?.email}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {admin?.role?.[0]?.role_title || 'Admin'}
                                </p>
                            </div>
                        </button>

                        {/* Dropdown menu */}
                        {showDropdown && (
                            <div className="absolute right-0 mt-2 w-56 bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-xl shadow-black/20 py-2 animate-fade-in">
                                <div className="px-4 py-2 border-b border-slate-700/50">
                                    <p className="text-sm font-medium text-white">{admin?.email}</p>
                                    <p className="text-xs text-slate-400">
                                        {admin?.role?.[0]?.role_title || 'Admin'}
                                    </p>
                                </div>
                                <button
                                    onClick={logout}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}

'use client';

import { useState, useMemo, ReactNode } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Search,
    Download,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from 'lucide-react';

export interface Column<T> {
    key: keyof T | string;
    header: string;
    sortable?: boolean;
    width?: string;
    render?: (item: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    searchable?: boolean;
    searchPlaceholder?: string;
    pageSize?: number;
    loading?: boolean;
    onRowClick?: (item: T) => void;
    emptyMessage?: string;
    exportable?: boolean;
    title?: string;
}

export default function DataTable<T extends object>({
    data,
    columns,
    searchable = true,
    searchPlaceholder = 'Search...',
    pageSize = 10,
    loading = false,
    onRowClick,
    emptyMessage = 'No data found',
    exportable = true,
    title,
}: DataTableProps<T>) {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Filter and sort data
    const filteredData = useMemo(() => {
        let result = [...data];

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter((item) =>
                Object.values(item).some(
                    (value) =>
                        value !== null &&
                        value !== undefined &&
                        String(value).toLowerCase().includes(term)
                )
            );
        }

        // Sort
        if (sortKey) {
            result.sort((a, b) => {
                const aVal = a[sortKey as keyof T];
                const bVal = b[sortKey as keyof T];

                if (aVal === bVal) return 0;
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;

                const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [data, searchTerm, sortKey, sortDirection]);

    // Pagination
    const totalPages = Math.ceil(filteredData.length / pageSize);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredData.slice(start, start + pageSize);
    }, [filteredData, currentPage, pageSize]);

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const handleExport = () => {
        const headers = columns.map((col) => col.header).join(',');
        const rows = filteredData.map((item) =>
            columns
                .map((col) => {
                    const value = item[col.key as keyof T];
                    return `"${String(value ?? '').replace(/"/g, '""')}"`;
                })
                .join(',')
        );
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="glass rounded-2xl overflow-hidden">
            {/* Header */}
            {(title || searchable || exportable) && (
                <div className="p-4 border-b border-slate-800/50 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    {title && (
                        <h3 className="text-lg font-semibold text-white">{title}</h3>
                    )}
                    <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
                        {searchable && (
                            <div className="relative flex-1 sm:flex-initial">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    placeholder={searchPlaceholder}
                                    className="w-full sm:w-64 pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                />
                            </div>
                        )}
                        {exportable && (
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-800/50">
                            {columns.map((column) => (
                                <th
                                    key={String(column.key)}
                                    className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider"
                                    style={{ width: column.width }}
                                >
                                    {column.sortable !== false ? (
                                        <button
                                            onClick={() => handleSort(String(column.key))}
                                            className="flex items-center gap-1 hover:text-white transition-colors"
                                        >
                                            {column.header}
                                            {sortKey === String(column.key) ? (
                                                sortDirection === 'asc' ? (
                                                    <ArrowUp className="w-3 h-3" />
                                                ) : (
                                                    <ArrowDown className="w-3 h-3" />
                                                )
                                            ) : (
                                                <ArrowUpDown className="w-3 h-3 opacity-50" />
                                            )}
                                        </button>
                                    ) : (
                                        column.header
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={i}>
                                    {columns.map((col, j) => (
                                        <td key={j} className="px-4 py-3">
                                            <div className="h-4 bg-slate-800/50 rounded animate-pulse" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : paginatedData.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-12 text-center text-slate-400"
                                >
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            paginatedData.map((item, index) => (
                                <tr
                                    key={index}
                                    onClick={() => onRowClick?.(item)}
                                    className={`
                                        transition-colors
                                        ${onRowClick ? 'cursor-pointer hover:bg-slate-800/50' : ''}
                                    `}
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={String(column.key)}
                                            className="px-4 py-3 text-sm text-slate-300"
                                        >
                                            {column.render
                                                ? column.render(item, index)
                                                : String(item[column.key as keyof T] ?? '-')}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-slate-800/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <p className="text-sm text-slate-400">
                        Showing {(currentPage - 1) * pageSize + 1} to{' '}
                        {Math.min(currentPage * pageSize, filteredData.length)} of{' '}
                        {filteredData.length} results
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronsLeft className="w-4 h-4 text-slate-400" />
                        </button>
                        <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4 text-slate-400" />
                        </button>
                        <span className="px-3 py-1 text-sm text-slate-300">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronsRight className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

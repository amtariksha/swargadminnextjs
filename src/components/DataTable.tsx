'use client';

import { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
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
    /** Custom export handler. Receives the currently filtered/sorted rows. If omitted, falls back to default CSV export using column headers. */
    onExport?: (filteredRows: T[]) => void;
    title?: string;
    /** Optional per-row extra class names (e.g. to grey-out soft-deleted rows). */
    rowClassName?: (item: T) => string;
    /** Stable row id accessor — enables the checkbox selection column when provided
     *  together with selectedIds + onSelectionChange. */
    getRowId?: (item: T) => number | string;
    selectedIds?: Set<number | string>;
    onSelectionChange?: (ids: Set<number | string>) => void;
    /** Set false to hide the selection column even when getRowId is provided. */
    selectable?: boolean;
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
    onExport,
    rowClassName,
    title,
    getRowId,
    selectedIds,
    onSelectionChange,
    selectable,
}: DataTableProps<T>) {
    // `loadedPages` is the highest "page" of rows currently rendered. The
    // table grows incrementally as the operator scrolls — when the sentinel
    // row at the end of the rendered list intersects the viewport, this
    // ticks up by one and the next page-worth of rows is appended. The
    // explicit pagination buttons still navigate (jump-to-first / next / etc)
    // but for everyday scrolling the table just keeps revealing rows.
    //
    // Resets to 1 whenever the search term, sort, or underlying data
    // changes, so the operator never has to scroll past stale pages after
    // typing a new search.
    const [loadedPages, setLoadedPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const sentinelRef = useRef<HTMLTableRowElement | null>(null);

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

    // Pagination — see comment on `loadedPages` above. Visible rows are
    // ALWAYS the first `loadedPages * pageSize` rows of filteredData, so
    // each scroll-driven tick reveals one more page-worth.
    const totalPages = Math.ceil(filteredData.length / pageSize);
    const visibleCount = Math.min(loadedPages * pageSize, filteredData.length);
    const paginatedData = useMemo(
        () => filteredData.slice(0, visibleCount),
        [filteredData, visibleCount]
    );
    const hasMore = visibleCount < filteredData.length;

    // Optional row selection. Select-all operates over the full FILTERED set
    // (not just the loaded page) so it means "all current matches".
    const selectionEnabled = selectable !== false && !!getRowId && !!selectedIds && !!onSelectionChange;
    const allFilteredSelected =
        selectionEnabled && filteredData.length > 0 && filteredData.every((item) => selectedIds!.has(getRowId!(item)));
    const toggleAll = () => {
        if (!selectionEnabled) return;
        const next = new Set(selectedIds);
        if (allFilteredSelected) filteredData.forEach((item) => next.delete(getRowId!(item)));
        else filteredData.forEach((item) => next.add(getRowId!(item)));
        onSelectionChange!(next);
    };
    const toggleOne = (item: T) => {
        if (!selectionEnabled) return;
        const id = getRowId!(item);
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange!(next);
    };

    // Reset the load window when the dataset, search, or sort changes —
    // otherwise an operator searching for a needle would still see the
    // last-page-of-haystack row count they had loaded.
    useEffect(() => {
        setLoadedPages(1);
    }, [searchTerm, sortKey, sortDirection, data]);

    // Auto-advance: when the sentinel row at the end of the rendered list
    // scrolls into view (with a 200px rootMargin so the next batch is
    // primed slightly before the user actually hits the bottom), bump
    // loadedPages and append the next page-worth of rows.
    useEffect(() => {
        if (!hasMore) return;
        const node = sentinelRef.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setLoadedPages((p) => p + 1);
                }
            },
            { rootMargin: '200px 0px' }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, visibleCount]);

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const handleExport = () => {
        // If parent provided a custom export handler, delegate to it with the
        // currently filtered/sorted rows (matches what user sees in the table).
        if (onExport) {
            onExport(filteredData);
            return;
        }
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
                                        // loadedPages reset is handled by the
                                        // useEffect on [searchTerm, ...]; no
                                        // manual reset needed here.
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

            {/* Top status row — shows what's currently loaded vs. total. The
                explicit pagination buttons jump-load chunks (a power-user
                shortcut) but for everyday work the operator just scrolls and
                rows keep revealing. */}
            {filteredData.length > 0 && (
                <div className="px-4 py-2.5 border-b border-slate-800/50 flex flex-col sm:flex-row gap-2 items-center justify-between">
                    <p className="text-sm text-slate-400">
                        Showing {visibleCount} of {filteredData.length} results
                        {hasMore && <span className="ml-2 text-xs text-slate-500">— scroll for more</span>}
                    </p>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setLoadedPages(1)}
                                disabled={loadedPages === 1}
                                title="Jump to first page"
                                className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronsLeft className="w-4 h-4 text-slate-400" />
                            </button>
                            <button
                                onClick={() => setLoadedPages((p) => Math.max(1, p - 1))}
                                disabled={loadedPages === 1}
                                title="Drop last loaded page"
                                className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4 text-slate-400" />
                            </button>
                            <span className="px-3 py-1 text-sm text-slate-300">
                                {loadedPages} / {totalPages}
                            </span>
                            <button
                                onClick={() => setLoadedPages((p) => Math.min(totalPages, p + 1))}
                                disabled={!hasMore}
                                title="Load next page"
                                className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                            </button>
                            <button
                                onClick={() => setLoadedPages(totalPages)}
                                disabled={!hasMore}
                                title="Load all pages"
                                className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronsRight className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-800/50">
                            {selectionEnabled && (
                                <th className="px-4 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded accent-purple-500"
                                        checked={allFilteredSelected}
                                        onChange={toggleAll}
                                        aria-label="Select all rows"
                                    />
                                </th>
                            )}
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
                                    {selectionEnabled && <td className="px-4 py-3" />}
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
                                    colSpan={columns.length + (selectionEnabled ? 1 : 0)}
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
                                        ${rowClassName ? rowClassName(item) : ''}
                                    `}
                                >
                                    {selectionEnabled && (
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded accent-purple-500"
                                                checked={selectedIds!.has(getRowId!(item))}
                                                onChange={() => toggleOne(item)}
                                                aria-label="Select row"
                                            />
                                        </td>
                                    )}
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
                        {/* Sentinel row — observed by the IntersectionObserver
                            in useEffect above. When it scrolls into view the
                            next page-worth of rows is appended. Rendered as a
                            single near-invisible row so the table layout stays
                            stable. */}
                        {hasMore && !loading && (
                            <tr ref={sentinelRef} aria-hidden="true">
                                <td colSpan={columns.length + (selectionEnabled ? 1 : 0)} className="px-4 py-2 text-center text-xs text-slate-500">
                                    Loading more…
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Bottom pagination removed — using top pagination only */}
        </div>
    );
}

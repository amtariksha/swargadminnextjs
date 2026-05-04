'use client';

import { Download } from 'lucide-react';
import type { DriverGroup } from '@/lib/deliveryHelpers';

interface DriverGroupTableProps {
    groups: DriverGroup[];
    emptyMsg: string;
    onExport: () => void;
}

/**
 * Renders driver→products groups as a stack of cards (one card per driver).
 * Used by both the admin /delivery-list (Routewise + Dairy Pickup tabs) and
 * the driver-facing /production-delivery page.
 *
 * Mobile-friendly: cards stack vertically; tables inside each card are full-
 * width with truncated long titles.
 */
export default function DriverGroupTable({ groups, emptyMsg, onExport }: DriverGroupTableProps) {
    const totalQty = groups.reduce((sum, g) => sum + g.totalQty, 0);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span><strong className="text-white">{groups.length}</strong> routes</span>
                    <span><strong className="text-purple-400">{totalQty}</strong> total qty</span>
                </div>
                <button
                    onClick={onExport}
                    disabled={groups.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-300 hover:text-white disabled:opacity-40"
                >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
            </div>
            {groups.length === 0 ? (
                <div className="glass rounded-xl p-12 text-center">
                    <p className="text-slate-400">{emptyMsg}</p>
                </div>
            ) : (
                groups.map((group) => (
                    <div key={group.driverName} className="glass rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
                            <h3 className="font-semibold text-white">{group.driverName}</h3>
                            <span className="text-sm text-purple-400 font-medium">{group.totalQty} qty</span>
                        </div>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-800/50">
                                    <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium">Product Title</th>
                                    <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium w-24">Qty Text</th>
                                    <th className="text-right px-4 py-2 text-xs text-slate-400 font-medium w-20">Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.products.map((p) => (
                                    <tr key={p.title} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                                        <td className="px-4 py-2.5 text-sm text-white">{p.title}</td>
                                        <td className="px-4 py-2.5 text-sm text-slate-400">{p.qty_text}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm font-bold">{p.qty}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))
            )}
        </div>
    );
}

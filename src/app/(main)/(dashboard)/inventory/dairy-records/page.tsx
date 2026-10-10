'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
    Milk,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    AlertTriangle,
    Plus,
    Trash2,
    Scale,
    PackageCheck,
    Droplets,
    ShieldCheck,
    FileText,
    ArrowRightLeft,
    Boxes,
    FlaskConical,
    Users,
} from 'lucide-react';
import DateWithTodayButton from '@/components/DateWithTodayButton';
import Modal from '@/components/Modal';
import {
    useDairySummary,
    useDairyReceipts,
    useDairyCollections,
    useDairySourceMaterials,
    useCreateDairyReceipt,
    useRawMaterialQualityParams,
    DairyUsage,
} from '@/hooks/useData';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

interface CanInput {
    id: string;
    can_no: number;
    gross_weight: string;
    tare_weight: string;
}

interface UsageInput {
    usage_type: string;
    label: string;
    qty: string;
    notes: string;
}

const DEFAULT_USAGES: { usage_type: string; label: string }[] = [
    { usage_type: 'packing', label: 'Allocated for Packing (Pouches / Bottles)' },
    { usage_type: 'curd', label: 'Curd Making (Dahi)' },
    { usage_type: 'butter', label: 'Butter Making (Makhan)' },
    { usage_type: 'ghee', label: 'Ghee Making' },
];

export default function DairyRecordsPage() {
    const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

    // Accordion state
    const [openAccordions, setOpenAccordions] = useState<{
        collections: boolean;
        usages: boolean;
        dairyReceipt: boolean;
    }>({
        collections: true,
        usages: true,
        dairyReceipt: true,
    });

    const toggleAccordion = (key: 'collections' | 'usages' | 'dairyReceipt') => {
        setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    // Data fetching
    const { data: summary, isLoading: isSummaryLoading } = useDairySummary(selectedDate);
    const { data: receipts = [], isLoading: isReceiptsLoading } = useDairyReceipts(selectedDate);
    const { data: collectionsData, isLoading: isCollectionsLoading } = useDairyCollections(selectedDate);
    const { data: sourceMaterials = [] } = useDairySourceMaterials();

    const collections = collectionsData?.collections || [];
    const latestReceipt = receipts[0]; // Dairy receipts for this date

    // Modal state for recording lot & usages
    const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
    const [sourceMaterialId, setSourceMaterialId] = useState<number | ''>('');
    const [certifiedBy, setCertifiedBy] = useState('Raushan');
    const [lotNotes, setLotNotes] = useState('');

    // Dynamic cans in modal
    const [cans, setCans] = useState<CanInput[]>([
        { id: '1', can_no: 1, gross_weight: '42.5', tare_weight: '2.5' },
    ]);

    // Dynamic usages in modal
    const [usages, setUsages] = useState<UsageInput[]>(() =>
        DEFAULT_USAGES.map((u) => ({
            usage_type: u.usage_type,
            label: u.label,
            qty: '',
            notes: '',
        }))
    );

    // Quality params for the selected source material
    const activeMaterialId = typeof sourceMaterialId === 'number' ? sourceMaterialId : sourceMaterials[0]?.id;
    const { data: qualityParams = [] } = useRawMaterialQualityParams(activeMaterialId);
    const [qualityReadings, setQualityReadings] = useState<Record<number, string>>({});

    const createReceiptMutation = useCreateDairyReceipt();

    // Calculations for modal
    const modalTotalNet = useMemo(() => {
        return cans.reduce((sum, c) => {
            const gross = parseFloat(c.gross_weight) || 0;
            const tare = parseFloat(c.tare_weight) || 0;
            return sum + Math.max(0, gross - tare);
        }, 0);
    }, [cans]);

    const modalTotalUsages = useMemo(() => {
        return usages.reduce((sum, u) => sum + (parseFloat(u.qty) || 0), 0);
    }, [usages]);

    const modalTallyDiff = modalTotalNet - modalTotalUsages;

    const handleOpenModal = () => {
        if (sourceMaterials.length > 0 && !sourceMaterialId) {
            setSourceMaterialId(sourceMaterials[0].id);
        }
        setIsRecordModalOpen(true);
    };

    const handleAddCan = () => {
        setCans((prev) => [
            ...prev,
            {
                id: Math.random().toString(36).substring(2, 9),
                can_no: prev.length + 1,
                gross_weight: '',
                tare_weight: '2.5',
            },
        ]);
    };

    const handleRemoveCan = (id: string) => {
        setCans((prev) => {
            const filtered = prev.filter((c) => c.id !== id);
            return filtered.map((c, idx) => ({ ...c, can_no: idx + 1 }));
        });
    };

    const handleCanChange = (id: string, field: 'gross_weight' | 'tare_weight', val: string) => {
        setCans((prev) =>
            prev.map((c) => (c.id === id ? { ...c, [field]: val } : c))
        );
    };

    const handleAddCustomUsage = () => {
        setUsages((prev) => [
            ...prev,
            {
                usage_type: 'other',
                label: 'Custom Usage (e.g. Paneer / Sample)',
                qty: '',
                notes: '',
            },
        ]);
    };

    const handleRemoveUsage = (index: number) => {
        setUsages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleUsageChange = (index: number, field: keyof UsageInput, val: string) => {
        setUsages((prev) =>
            prev.map((u, i) => (i === index ? { ...u, [field]: val } : u))
        );
    };

    const handleSubmitLot = async () => {
        const matId = typeof sourceMaterialId === 'number' ? sourceMaterialId : sourceMaterials[0]?.id;
        if (!matId) {
            toast.error('Please select a source raw material');
            return;
        }

        const validCans = cans
            .map((c) => ({
                can_no: c.can_no,
                gross_weight: parseFloat(c.gross_weight) || 0,
                tare_weight: parseFloat(c.tare_weight) || 0,
            }))
            .filter((c) => c.gross_weight > c.tare_weight);

        if (validCans.length === 0) {
            toast.error('Please enter at least one valid can with gross weight greater than tare weight');
            return;
        }

        const validUsages: DairyUsage[] = usages
            .filter((u) => parseFloat(u.qty) > 0)
            .map((u) => ({
                usage_type: u.usage_type,
                label: u.label,
                qty: parseFloat(u.qty),
                notes: u.notes?.trim() || null,
            }));

        const readingsPayload = Object.entries(qualityReadings)
            .filter(([_, val]) => val.trim() !== '')
            .map(([paramId, val]) => ({
                raw_material_quality_param_id: Number(paramId),
                value: isNaN(Number(val)) ? val : Number(val),
            }));

        try {
            await createReceiptMutation.mutateAsync({
                receipt_date: selectedDate,
                source_raw_material_id: matId,
                certified_by: certifiedBy.trim() || 'Raushan',
                certification_status: 'certified',
                notes: lotNotes.trim() || undefined,
                cans: validCans,
                quality_readings: readingsPayload,
                usages: validUsages,
            });

            toast.success('Daily milk lot and usages certified successfully!');
            setIsRecordModalOpen(false);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to record dairy receipt';
            toast.error(msg);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Date Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
                        <Milk className="w-7 h-7 text-amber-400" />
                        Dairy Milk Lot & Tally Records
                    </h1>
                    <p className="text-slate-400 text-sm mt-0.5">
                        Certified lot quality parameters, dynamic farmer collections, and milk usage allocations
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <DateWithTodayButton
                        value={selectedDate}
                        onChange={(newDate) => setSelectedDate(newDate)}
                    />
                    <button
                        onClick={handleOpenModal}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-purple-500/20 flex items-center gap-2 transition"
                    >
                        <Plus className="w-4 h-4" />
                        Record Daily Lot & Usages
                    </button>
                </div>
            </div>

            {/* Parent Certified Record Banner */}
            <div className="glass rounded-2xl p-5 border border-purple-500/30 bg-slate-900/60 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                            <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                <ShieldCheck className="w-5 h-5" />
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">
                                Parent Lot Quality Certification
                            </span>
                            {latestReceipt ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Certified by {latestReceipt.certified_by || 'Raushan'} at Milk Dairy
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Pending Lot Certification for {selectedDate}
                                </span>
                            )}
                        </div>
                        <h2 className="text-lg font-semibold text-white">
                            Milk Lot Record — Certified by Raushan at Milk Dairy
                        </h2>
                        <p className="text-xs text-slate-400 max-w-3xl">
                            Consolidated parent lot certified at arrival. Stores quality parameters across all farmer
                            collections and tallies received bulk milk against downstream usages (packing, curd, butter, and ghee).
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {latestReceipt && (
                            <div className="text-right">
                                <div className="text-xs text-slate-400">Net Weighed Lot</div>
                                <div className="text-xl font-bold text-emerald-400">
                                    {latestReceipt.total_net_qty.toFixed(2)} {latestReceipt.unit || 'L'}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                    {latestReceipt.cans.length} Cans Weighed
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Cards / Tally Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Farm Collections Total */}
                <div className="glass rounded-2xl p-4 border border-slate-800 bg-slate-900/40 space-y-2">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                        <span>1. Farm Collections</span>
                        <Users className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {summary?.collected_total != null ? summary.collected_total.toFixed(2) : '0.00'} <span className="text-sm font-normal text-slate-400">L</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80">
                        <span>{collectionsData?.count || collections.length} Farmers</span>
                        <span className="text-cyan-400 font-medium">
                            ₹{Number(collectionsData?.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* 2. Dairy Received Total */}
                <div className="glass rounded-2xl p-4 border border-slate-800 bg-slate-900/40 space-y-2">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                        <span>2. Dairy Received (Net)</span>
                        <Scale className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-400">
                        {summary?.received_total != null ? summary.received_total.toFixed(2) : '0.00'} <span className="text-sm font-normal text-slate-400">L</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80">
                        <span>Transit Variance</span>
                        <span className={`font-medium ${
                            (summary?.variance_transit || 0) < 0
                                ? 'text-amber-400'
                                : (summary?.variance_transit || 0) > 0
                                ? 'text-blue-400'
                                : 'text-slate-400'
                        }`}>
                            {(summary?.variance_transit || 0) > 0 ? '+' : ''}
                            {(summary?.variance_transit || 0).toFixed(2)} L
                        </span>
                    </div>
                </div>

                {/* 3. Usages Total */}
                <div className="glass rounded-2xl p-4 border border-slate-800 bg-slate-900/40 space-y-2">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                        <span>3. Milk Usages (Outgoing)</span>
                        <PackageCheck className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-2xl font-bold text-purple-400">
                        {summary?.usages_total != null ? summary.usages_total.toFixed(2) : '0.00'} <span className="text-sm font-normal text-slate-400">L</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80">
                        <span>{summary?.usage_breakdown?.length || 0} Usage Heads</span>
                        <span className="text-purple-300">Allocated</span>
                    </div>
                </div>

                {/* 4. Net Tally Difference */}
                <div className={`glass rounded-2xl p-4 border ${
                    summary?.is_balanced
                        ? 'border-emerald-500/40 bg-emerald-950/20'
                        : Math.abs(summary?.tally_difference || 0) > 0
                        ? 'border-amber-500/40 bg-amber-950/20'
                        : 'border-slate-800 bg-slate-900/40'
                } space-y-2`}>
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                        <span>Incoming vs Outgoing Tally</span>
                        <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-bold text-white flex items-center gap-2">
                        <span>{Math.abs(summary?.tally_difference || 0).toFixed(2)}</span>
                        <span className="text-sm font-normal text-slate-400">L diff</span>
                    </div>
                    <div className="pt-1 border-t border-slate-800/80">
                        {summary?.is_balanced ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                100% Balanced Tally
                            </span>
                        ) : (summary?.tally_difference || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {summary?.tally_difference?.toFixed(2)} L Unallocated Surplus
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {Math.abs(summary?.tally_difference || 0).toFixed(2)} L Over-allocated Deficit
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Accordion 1: Farmer Collections (Incoming) */}
            <div className="glass rounded-2xl border border-slate-800 overflow-hidden">
                <button
                    onClick={() => toggleAccordion('collections')}
                    className="w-full px-5 py-4 flex items-center justify-between bg-slate-900/50 hover:bg-slate-800/50 transition text-left"
                >
                    <div className="flex items-center gap-3">
                        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Users className="w-5 h-5" />
                        </span>
                        <div>
                            <div className="text-base font-semibold text-white flex items-center gap-2">
                                Accordion 1: Collections at Farm (Farmer Account Heads)
                                <span className="px-2 py-0.5 rounded-full text-xs font-normal bg-blue-500/20 text-blue-300">
                                    {collections.length} Farmers
                                </span>
                            </div>
                            <p className="text-xs text-slate-400">
                                Dynamic purchases per farmer account head (e.g. Ramesh, Sasi, Umapati, Suresh)
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold text-white">
                                {Number(collectionsData?.total_qty || 0).toFixed(2)} L
                            </div>
                            <div className="text-xs text-cyan-400">
                                ₹{Number(collectionsData?.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        {openAccordions.collections ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                    </div>
                </button>

                {openAccordions.collections && (
                    <div className="p-5 border-t border-slate-800 space-y-4">
                        {isCollectionsLoading ? (
                            <div className="py-8 text-center text-slate-400 text-sm">
                                Loading farmer collection entries...
                            </div>
                        ) : collections.length === 0 ? (
                            <div className="py-8 text-center text-slate-400 text-sm">
                                No farm collections recorded for {selectedDate}.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="text-xs uppercase bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">Farmer / Account Head</th>
                                            <th className="px-4 py-3 font-medium">Raw Material</th>
                                            <th className="px-4 py-3 font-medium text-right">Quantity (L)</th>
                                            <th className="px-4 py-3 font-medium text-right">Rate (₹/L)</th>
                                            <th className="px-4 py-3 font-medium text-right">Total (₹)</th>
                                            <th className="px-4 py-3 font-medium">Quality Parameters</th>
                                            <th className="px-4 py-3 font-medium text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {collections.map((c) => (
                                            <tr key={c.id} className="hover:bg-slate-800/30 transition">
                                                <td className="px-4 py-3 font-medium text-white">
                                                    <div>{c.farmer_name}</div>
                                                    {c.farmer_phone && (
                                                        <div className="text-xs text-slate-500">{c.farmer_phone}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">
                                                    {c.raw_material_name}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold text-white">
                                                    {Number(c.qty).toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-300">
                                                    ₹{Number(c.unit_price).toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-cyan-400">
                                                    ₹{Number(c.total_amount).toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {c.quality_readings && c.quality_readings.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {c.quality_readings.map((qr, idx) => (
                                                                <span
                                                                    key={idx}
                                                                    className="px-2 py-0.5 rounded text-xs bg-slate-800 border border-slate-700 text-slate-300"
                                                                >
                                                                    <span className="text-slate-400">{qr.param_name}:</span>{' '}
                                                                    <span className="font-medium text-emerald-400">{qr.value}</span>
                                                                    {qr.unit ? ` ${qr.unit}` : ''}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-500">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        c.status === 'approved'
                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    }`}>
                                                        {c.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Accordion 2: Milk Usages & Allocations (Outgoing) */}
            <div className="glass rounded-2xl border border-slate-800 overflow-hidden">
                <button
                    onClick={() => toggleAccordion('usages')}
                    className="w-full px-5 py-4 flex items-center justify-between bg-slate-900/50 hover:bg-slate-800/50 transition text-left"
                >
                    <div className="flex items-center gap-3">
                        <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <PackageCheck className="w-5 h-5" />
                        </span>
                        <div>
                            <div className="text-base font-semibold text-white flex items-center gap-2">
                                Accordion 2: Milk Usages & Allocations (Outgoing)
                                <span className="px-2 py-0.5 rounded-full text-xs font-normal bg-purple-500/20 text-purple-300">
                                    {(summary?.usages_total || 0).toFixed(2)} L Total
                                </span>
                            </div>
                            <p className="text-xs text-slate-400">
                                Milk allocated for packing, curd making, butter making, and ghee making
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold text-purple-400">
                                {(summary?.usages_total || 0).toFixed(2)} L
                            </div>
                            <div className="text-xs text-slate-400">
                                {summary?.usage_breakdown?.length || 0} allocations
                            </div>
                        </div>
                        {openAccordions.usages ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                    </div>
                </button>

                {openAccordions.usages && (
                    <div className="p-5 border-t border-slate-800 space-y-6">
                        {summary?.usage_breakdown && summary.usage_breakdown.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {summary.usage_breakdown.map((ub, idx) => {
                                    const percent =
                                        (summary.received_total || 0) > 0
                                            ? ((ub.qty / (summary.received_total || 1)) * 100).toFixed(1)
                                            : null;
                                    return (
                                        <div
                                            key={idx}
                                            className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2 relative overflow-hidden"
                                        >
                                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                {ub.label || ub.usage_type}
                                            </div>
                                            <div className="text-2xl font-bold text-white flex items-baseline gap-1.5">
                                                <span>{ub.qty.toFixed(2)}</span>
                                                <span className="text-xs text-slate-400 font-normal">L</span>
                                            </div>
                                            {percent && (
                                                <div className="space-y-1 pt-1">
                                                    <div className="flex justify-between text-[11px] text-slate-400">
                                                        <span>Share of Received</span>
                                                        <span className="text-purple-300 font-medium">{percent}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
                                                        <div
                                                            className="bg-purple-500 h-full rounded-full"
                                                            style={{ width: `${Math.min(100, Number(percent))}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-6 text-center text-slate-400 text-sm">
                                No milk usage allocations recorded for this date yet. Click &quot;Record Daily Lot & Usages&quot; to allocate milk.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Accordion 3: Dairy Can Weighing & Quality Parameters */}
            <div className="glass rounded-2xl border border-slate-800 overflow-hidden">
                <button
                    onClick={() => toggleAccordion('dairyReceipt')}
                    className="w-full px-5 py-4 flex items-center justify-between bg-slate-900/50 hover:bg-slate-800/50 transition text-left"
                >
                    <div className="flex items-center gap-3">
                        <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Scale className="w-5 h-5" />
                        </span>
                        <div>
                            <div className="text-base font-semibold text-white flex items-center gap-2">
                                Accordion 3: Dairy Can Weighing & Quality Parameters
                                {latestReceipt && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-normal bg-emerald-500/20 text-emerald-300">
                                        Certified by {latestReceipt.certified_by || 'Raushan'}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-400">
                                Individual cans weighed at dairy and batch quality readings (Fat %, SNF %, CLR, Temp)
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {openAccordions.dairyReceipt ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                    </div>
                </button>

                {openAccordions.dairyReceipt && (
                    <div className="p-5 border-t border-slate-800 space-y-6">
                        {isReceiptsLoading ? (
                            <div className="py-8 text-center text-slate-400 text-sm">
                                Loading dairy receipt records...
                            </div>
                        ) : !latestReceipt ? (
                            <div className="py-8 text-center text-slate-400 text-sm">
                                No dairy receipts recorded for {selectedDate}.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Batch Quality Readings */}
                                {latestReceipt.quality_readings && latestReceipt.quality_readings.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                            <FlaskConical className="w-4 h-4 text-emerald-400" />
                                            Dairy Quality Parameters (Certified by Raushan)
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {latestReceipt.quality_readings.map((qr, idx) => (
                                                <div
                                                    key={idx}
                                                    className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between"
                                                >
                                                    <span className="text-xs text-slate-400">{qr.param_name}</span>
                                                    <span className="text-lg font-bold text-emerald-400">
                                                        {qr.value} {qr.unit || ''}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Cans Table */}
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                        <Scale className="w-4 h-4 text-blue-400" />
                                        Cans Weighed at Dairy
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm text-slate-300">
                                            <thead className="text-xs uppercase bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                                                <tr>
                                                    <th className="px-4 py-2.5 font-medium">Can No</th>
                                                    <th className="px-4 py-2.5 font-medium text-right">Gross Wt (kg/L)</th>
                                                    <th className="px-4 py-2.5 font-medium text-right">Tare Wt (kg/L)</th>
                                                    <th className="px-4 py-2.5 font-medium text-right">Net Wt (kg/L)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/60">
                                                {latestReceipt.cans.map((can, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-800/30">
                                                        <td className="px-4 py-2.5 font-medium text-white">
                                                            Can #{can.can_no}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right text-slate-300">
                                                            {can.gross_weight.toFixed(2)}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right text-slate-400">
                                                            {can.tare_weight.toFixed(2)}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-bold text-emerald-400">
                                                            {can.net_weight.toFixed(2)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-slate-800/40 font-semibold border-t border-slate-700/80">
                                                    <td className="px-4 py-3 text-white">
                                                        Total ({latestReceipt.cans.length} cans)
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-300">
                                                        {latestReceipt.cans.reduce((s, c) => s + c.gross_weight, 0).toFixed(2)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-400">
                                                        {latestReceipt.cans.reduce((s, c) => s + c.tare_weight, 0).toFixed(2)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-emerald-400 font-bold text-base">
                                                        {latestReceipt.total_net_qty.toFixed(2)} {latestReceipt.unit || 'L'}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {latestReceipt.notes && (
                                    <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs text-slate-400">
                                        <span className="font-semibold text-slate-300">Notes:</span> {latestReceipt.notes}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Record Daily Lot & Usages Modal */}
            <Modal
                isOpen={isRecordModalOpen}
                onClose={() => setIsRecordModalOpen(false)}
                title="Record Certified Daily Milk Lot & Usages"
                size="xl"
            >
                <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
                    {/* Header Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Receipt Date</label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Source Raw Material</label>
                            <select
                                value={sourceMaterialId}
                                onChange={(e) => setSourceMaterialId(Number(e.target.value))}
                                className={inputCls}
                            >
                                {sourceMaterials.map((sm) => (
                                    <option key={sm.id} value={sm.id}>
                                        {sm.name} ({sm.unit})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                Verified & Certified By
                            </label>
                            <input
                                type="text"
                                value={certifiedBy}
                                onChange={(e) => setCertifiedBy(e.target.value)}
                                placeholder="Raushan"
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Certification Status</label>
                            <div className="px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded-xl text-emerald-400 text-sm font-medium flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                Certified (Verified at Dairy)
                            </div>
                        </div>
                    </div>

                    {/* Quality Parameters */}
                    {qualityParams.length > 0 && (
                        <div className="space-y-2 p-3 bg-slate-800/30 rounded-xl border border-slate-700/40">
                            <h4 className="text-xs font-semibold uppercase text-slate-300 flex items-center gap-1.5">
                                <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
                                Quality Parameters of Complete Lot
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {qualityParams.map((p) => (
                                    <div key={p.id}>
                                        <label className="block text-[11px] text-slate-400 mb-0.5">
                                            {p.name} {p.unit ? `(${p.unit})` : ''}
                                        </label>
                                        <input
                                            type="text"
                                            value={qualityReadings[p.id] || ''}
                                            onChange={(e) =>
                                                setQualityReadings((prev) => ({
                                                    ...prev,
                                                    [p.id]: e.target.value,
                                                }))
                                            }
                                            placeholder={p.name.includes('Fat') ? '6.5' : p.name.includes('SNF') ? '8.5' : ''}
                                            className={inputCls}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Can Weighing Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                                <Scale className="w-4 h-4 text-blue-400" />
                                Can Weighing (Gross − Tare = Net)
                            </h4>
                            <button
                                type="button"
                                onClick={handleAddCan}
                                className="px-2.5 py-1 text-xs font-medium text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg flex items-center gap-1 transition"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add Can
                            </button>
                        </div>

                        <div className="space-y-2">
                            {cans.map((can, idx) => {
                                const gross = parseFloat(can.gross_weight) || 0;
                                const tare = parseFloat(can.tare_weight) || 0;
                                const net = Math.max(0, gross - tare);

                                return (
                                    <div
                                        key={can.id}
                                        className="grid grid-cols-12 gap-2 items-center bg-slate-800/40 p-2.5 rounded-xl border border-slate-700/50"
                                    >
                                        <div className="col-span-2 text-xs font-semibold text-slate-300">
                                            Can #{can.can_no}
                                        </div>
                                        <div className="col-span-3">
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={can.gross_weight}
                                                onChange={(e) => handleCanChange(can.id, 'gross_weight', e.target.value)}
                                                placeholder="Gross wt"
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={can.tare_weight}
                                                onChange={(e) => handleCanChange(can.id, 'tare_weight', e.target.value)}
                                                placeholder="Tare wt"
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="col-span-3 text-right">
                                            <span className="text-xs text-slate-400">Net: </span>
                                            <span className="text-sm font-bold text-emerald-400">
                                                {net.toFixed(2)} L
                                            </span>
                                        </div>
                                        <div className="col-span-1 text-center">
                                            {cans.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveCan(can.id)}
                                                    className="p-1 text-slate-400 hover:text-rose-400 transition"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-between items-center p-3 rounded-xl bg-slate-800/70 border border-slate-700 font-medium text-sm">
                            <span className="text-slate-300">Total Net Weighed Milk:</span>
                            <span className="text-emerald-400 font-bold text-base">
                                {modalTotalNet.toFixed(2)} L
                            </span>
                        </div>
                    </div>

                    {/* Milk Usages Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                                <PackageCheck className="w-4 h-4 text-purple-400" />
                                Milk Usages Allocation (Downstream Allocation)
                            </h4>
                            <button
                                type="button"
                                onClick={handleAddCustomUsage}
                                className="px-2.5 py-1 text-xs font-medium text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg flex items-center gap-1 transition"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Custom Usage
                            </button>
                        </div>

                        <div className="space-y-2.5">
                            {usages.map((u, idx) => (
                                <div
                                    key={idx}
                                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <input
                                            type="text"
                                            value={u.label}
                                            onChange={(e) => handleUsageChange(idx, 'label', e.target.value)}
                                            className="w-full text-xs font-semibold text-white bg-transparent border-b border-transparent focus:border-purple-500 focus:outline-none"
                                        />
                                        {idx >= DEFAULT_USAGES.length && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveUsage(idx)}
                                                className="text-slate-500 hover:text-rose-400 transition"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <div className="sm:col-span-1">
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={u.qty}
                                                onChange={(e) => handleUsageChange(idx, 'qty', e.target.value)}
                                                placeholder="Qty in Litres"
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <input
                                                type="text"
                                                value={u.notes}
                                                onChange={(e) => handleUsageChange(idx, 'notes', e.target.value)}
                                                placeholder="Notes / Batch ref (optional)"
                                                className={inputCls}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Live Tally Bar in Modal */}
                        <div className={`p-4 rounded-xl border ${
                            Math.abs(modalTallyDiff) < 0.01 && modalTotalNet > 0
                                ? 'bg-emerald-950/30 border-emerald-500/40'
                                : 'bg-slate-800/80 border-slate-700'
                        } space-y-2`}>
                            <div className="flex justify-between text-xs text-slate-300">
                                <span>Total Weighed Net: <strong className="text-white">{modalTotalNet.toFixed(2)} L</strong></span>
                                <span>Total Allocated: <strong className="text-purple-300">{modalTotalUsages.toFixed(2)} L</strong></span>
                                <span>
                                    Remaining: <strong className={modalTallyDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                        {modalTallyDiff.toFixed(2)} L
                                    </strong>
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                                {Math.abs(modalTallyDiff) < 0.01 && modalTotalNet > 0 ? (
                                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Milk tally is balanced! 100% of incoming milk is accounted for.
                                    </span>
                                ) : modalTallyDiff > 0 ? (
                                    <span className="text-amber-400 flex items-center gap-1">
                                        <AlertTriangle className="w-4 h-4" />
                                        {modalTallyDiff.toFixed(2)} L remaining to allocate.
                                    </span>
                                ) : (
                                    <span className="text-rose-400 flex items-center gap-1">
                                        <AlertTriangle className="w-4 h-4" />
                                        Over-allocated by {Math.abs(modalTallyDiff).toFixed(2)} L.
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* General Notes */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Lot Notes</label>
                        <textarea
                            rows={2}
                            value={lotNotes}
                            onChange={(e) => setLotNotes(e.target.value)}
                            placeholder="Quality notes, transit observations, etc."
                            className={inputCls}
                        />
                    </div>

                    {/* Modal Actions */}
                    <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={() => setIsRecordModalOpen(false)}
                            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmitLot}
                            disabled={createReceiptMutation.isPending}
                            className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-purple-500/20 disabled:opacity-50"
                        >
                            {createReceiptMutation.isPending ? 'Certifying...' : 'Certify & Save Lot'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

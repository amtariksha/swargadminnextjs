'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccountingConfig } from '@/hooks/useAccounting';
import { GST_REG_TYPE_OPTIONS } from '@/lib/accounting';
import { PUT } from '@/lib/api';
import { toast } from 'sonner';
import {
    Users, FileText, BookText, Calculator, Building2, Banknote,
    CalendarRange, BellRing, Power,
} from 'lucide-react';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const blankForm = {
    legal_name: '', trade_name: '', gstin: '', supplier_state_code: '',
    gst_registration_type: '1', default_hsn_code: '', default_gst_rate: '',
};

const QUICK_LINKS = [
    { href: '/accounting/customers', label: 'Customers', icon: Users, desc: 'GST profiles' },
    { href: '/accounting/hsn', label: 'HSN & Rates', icon: Calculator, desc: 'Codes, rates, product mapping' },
    { href: '/accounting/invoices', label: 'Invoices', icon: FileText, desc: 'GST system of record' },
    { href: '/accounting/ledgers', label: 'Ledgers', icon: BookText, desc: 'Customer statement + ageing' },
    { href: '/accounting/tally-settings', label: 'Tally', icon: Building2, desc: 'Bridge + voucher queue' },
    { href: '/accounting/bank-reconciliation', label: 'Bank Recon', icon: Banknote, desc: 'Upload → match → confirm' },
    { href: '/accounting/b2c-consolidation', label: 'B2C Consolidation', icon: CalendarRange, desc: 'Monthly roll-up' },
    { href: '/accounting/reminders', label: 'Reminders', icon: BellRing, desc: 'Payment cadence rules' },
];

export default function AccountingHomePage() {
    const { data, isLoading, refetch } = useAccountingConfig();
    const [form, setForm] = useState(blankForm);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [togglingEnabled, setTogglingEnabled] = useState(false);

    useEffect(() => {
        if (data?.profile) {
            const p = data.profile;
            setForm({
                legal_name: p.legal_name || '', trade_name: p.trade_name || '',
                gstin: p.gstin || '', supplier_state_code: p.supplier_state_code || '',
                gst_registration_type: String(p.gst_registration_type ?? 1),
                default_hsn_code: p.default_hsn_code || '',
                default_gst_rate: p.default_gst_rate != null ? String(p.default_gst_rate) : '',
            });
        }
    }, [data]);

    const enabled = !!data?.accounting_enabled;

    const handleToggle = async () => {
        setTogglingEnabled(true);
        try {
            await PUT('/accounting/config/enabled', { enabled: enabled ? 0 : 1 });
            toast.success(`Accounting ${enabled ? 'disabled' : 'enabled'}`);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to toggle');
        } finally {
            setTogglingEnabled(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await PUT('/accounting/config', {
                legal_name: form.legal_name || null,
                trade_name: form.trade_name || null,
                gstin: form.gstin.trim().toUpperCase() || null,
                supplier_state_code: form.supplier_state_code || null,
                gst_registration_type: Number(form.gst_registration_type) || 1,
                default_hsn_code: form.default_hsn_code || null,
                default_gst_rate: form.default_gst_rate !== '' ? Number(form.default_gst_rate) : null,
            });
            toast.success('Org GST profile saved');
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Accounting</h1>
                    <p className="text-slate-400">GST invoicing, ledgers, Tally sync &amp; reconciliation</p>
                </div>
                <button
                    onClick={handleToggle}
                    disabled={togglingEnabled || isLoading}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium border transition-colors disabled:opacity-50 ${
                        enabled
                            ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
                    }`}
                >
                    <Power className="w-4 h-4" />
                    {enabled ? 'Accounting Enabled' : 'Accounting Disabled'}
                </button>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {QUICK_LINKS.map((l) => (
                    <Link key={l.href} href={l.href}
                        className="glass rounded-2xl p-4 hover:bg-slate-800/40 transition-colors group">
                        <l.icon className="w-6 h-6 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                        <div className="font-semibold text-white">{l.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{l.desc}</div>
                    </Link>
                ))}
            </div>

            {/* Supplier identity */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-1">Supplier identity (org GST profile)</h2>
                <p className="text-sm text-slate-400 mb-4">
                    The supplier state code drives the CGST/SGST vs IGST split — set it before issuing invoices.
                    Default HSN/rate are used until products are mapped on the HSN page.
                </p>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Legal name</label>
                            <input type="text" value={form.legal_name}
                                onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Trade name</label>
                            <input type="text" value={form.trade_name}
                                onChange={(e) => setForm({ ...form, trade_name: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">GSTIN</label>
                            <input type="text" value={form.gstin} maxLength={15}
                                placeholder="29ABCDE1234F1Z5"
                                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Supplier state code *</label>
                            <input type="text" value={form.supplier_state_code} maxLength={2} placeholder="29"
                                onChange={(e) => setForm({ ...form, supplier_state_code: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Registration type</label>
                            <select value={form.gst_registration_type}
                                onChange={(e) => setForm({ ...form, gst_registration_type: e.target.value })} className={inputCls}>
                                {GST_REG_TYPE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Default HSN</label>
                                <input type="text" value={form.default_hsn_code}
                                    onChange={(e) => setForm({ ...form, default_hsn_code: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Default rate %</label>
                                <input type="number" step="0.01" value={form.default_gst_rate}
                                    onChange={(e) => setForm({ ...form, default_gst_rate: e.target.value })} className={inputCls} />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={isSubmitting}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {isSubmitting ? 'Saving...' : 'Save profile'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

'use client';

/**
 * CoaActionBar — Phase 3.5. The "New …" buttons on the Chart of Accounts page:
 * New Ledger / Group / Bank / Tax Ledger (→ GL endpoints), New Supplier (→ the
 * canonical /inventory/vendors create, which auto-makes a Sundry Creditors
 * ledger), and New Customer (→ the customers page, where users get a GST
 * profile). All mutations invalidate the accounting queries so the tree + chart
 * refresh immediately.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookText, FolderTree, Banknote, Receipt, Truck, Users } from 'lucide-react';
import { POST } from '@/lib/api';
import Modal from '@/components/Modal';
import { inputClassName } from '@/components/FormField';
import type { AccountGroup } from '@/hooks/useAccounting';

type Action = 'ledger' | 'group' | 'supplier';

interface Props {
    groups: AccountGroup[];
    /** Group selected in the side-rail — preselected as the New Ledger target. */
    selectedGroupId: number | null;
}

const NATURE_OPTIONS = [
    { value: 1, label: 'Asset' },
    { value: 2, label: 'Liability' },
    { value: 3, label: 'Income' },
    { value: 4, label: 'Expense' },
    { value: 5, label: 'Equity' },
];

export default function CoaActionBar({ groups, selectedGroupId }: Props) {
    const qc = useQueryClient();
    const [action, setAction] = useState<Action | null>(null);
    const [title, setTitle] = useState('');
    const [lockGroup, setLockGroup] = useState(false);
    const [busy, setBusy] = useState(false);

    // Shared form state.
    const [name, setName] = useState('');
    const [groupId, setGroupId] = useState<string>('');
    const [nature, setNature] = useState(4);
    const [parentId, setParentId] = useState<string>('');
    const [opening, setOpening] = useState('');
    const [openingDebit, setOpeningDebit] = useState(true);
    const [phone, setPhone] = useState('');
    const [gst, setGst] = useState('');

    const byName = useMemo(() => new Map(groups.map((g) => [g.name, g])), [groups]);

    // Full path label (Primary ▸ Sub-group) for the group <select> options.
    const pathOf = useMemo(() => {
        const byId = new Map(groups.map((g) => [g.id, g]));
        const cache = new Map<number, string>();
        const visiting = new Set<number>();
        const build = (gid: number | null): string => {
            if (gid == null || visiting.has(gid)) return '';  // cycle-safe
            if (cache.has(gid)) return cache.get(gid)!;
            const g = byId.get(gid);
            if (!g) return '';
            visiting.add(gid);
            const parent = build(g.parent_group_id);
            visiting.delete(gid);
            const path = parent ? `${parent} ▸ ${g.name}` : g.name;
            cache.set(gid, path);
            return path;
        };
        return build;
    }, [groups]);

    const groupOptions = useMemo(
        () => groups.map((g) => ({ id: g.id, label: pathOf(g.id) })).sort((a, b) => a.label.localeCompare(b.label)),
        [groups, pathOf],
    );

    const reset = () => {
        setName(''); setGroupId(''); setNature(4); setParentId('');
        setOpening(''); setOpeningDebit(true); setPhone(''); setGst('');
    };
    const close = () => { setAction(null); setLockGroup(false); reset(); };

    const openLedger = (presetGroupName?: string, modalTitle = 'New Ledger') => {
        reset();
        const preset = presetGroupName ? byName.get(presetGroupName) : null;
        if (preset) { setGroupId(String(preset.id)); setLockGroup(true); }
        else if (selectedGroupId) setGroupId(String(selectedGroupId));
        setTitle(modalTitle);
        setAction('ledger');
    };
    const openGroup = () => { reset(); setTitle('New Account Group'); setAction('group'); };
    const openSupplier = () => { reset(); setTitle('New Supplier'); setAction('supplier'); };

    const finish = async (msg: string) => {
        await qc.invalidateQueries({ queryKey: ['accounting'] });
        toast.success(msg);
        close();
    };

    const submit = async () => {
        if (!name.trim()) { toast.error('Name is required'); return; }
        setBusy(true);
        try {
            if (action === 'ledger') {
                if (!groupId) { toast.error('Pick a group'); setBusy(false); return; }
                await POST('/accounting/gl/ledgers', {
                    name: name.trim(), account_group_id: Number(groupId),
                    opening_balance: Number(opening) || 0, opening_is_debit: openingDebit ? 1 : 0,
                });
                await finish('Ledger created');
            } else if (action === 'group') {
                await POST('/accounting/gl/groups', {
                    name: name.trim(), nature,
                    parent_group_id: parentId ? Number(parentId) : undefined,
                    affects_pl: nature === 3 || nature === 4 ? 1 : 0,
                });
                await finish('Account group created');
            } else if (action === 'supplier') {
                await POST('/inventory/vendors', {
                    name: name.trim(),
                    phone: phone.trim() || undefined,
                    gst_number: gst.trim().toUpperCase() || undefined,
                    opening_balance: Number(opening) || 0,
                });
                await finish('Supplier created (Sundry Creditors ledger added)');
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed');
        } finally {
            setBusy(false);
        }
    };

    const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-slate-800/60 border border-slate-700/50 text-slate-200 hover:bg-slate-700/60 transition-colors';

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => openLedger()} className={btn}><BookText className="w-4 h-4" /> New Ledger</button>
                <button onClick={openGroup} className={btn}><FolderTree className="w-4 h-4" /> New Group</button>
                <button onClick={() => openLedger('Bank Accounts', 'New Bank Account')} className={btn}><Banknote className="w-4 h-4" /> New Bank</button>
                <button onClick={() => openLedger('Duties & Taxes', 'New Tax Ledger')} className={btn}><Receipt className="w-4 h-4" /> New Tax Ledger</button>
                <button onClick={openSupplier} className={btn}><Truck className="w-4 h-4" /> New Supplier</button>
                <Link href="/accounting/customers" className={btn}><Users className="w-4 h-4" /> New Customer</Link>
            </div>

            <Modal isOpen={action !== null} onClose={close} title={title} size="md">
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">
                            {action === 'supplier' ? 'Supplier name' : 'Name'}
                        </label>
                        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClassName} placeholder="e.g. HDFC Current A/c" />
                    </div>

                    {action === 'ledger' && (
                        <>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Group</label>
                                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={lockGroup} className={`${inputClassName} disabled:opacity-60`}>
                                    <option value="">Select group…</option>
                                    {groupOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Opening balance</label>
                                    <input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} className={inputClassName} placeholder="0" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Dr / Cr</label>
                                    <select value={openingDebit ? '1' : '0'} onChange={(e) => setOpeningDebit(e.target.value === '1')} className={inputClassName}>
                                        <option value="1">Debit</option>
                                        <option value="0">Credit</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    {action === 'group' && (
                        <>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Nature</label>
                                <select value={nature} onChange={(e) => setNature(Number(e.target.value))} className={inputClassName}>
                                    {NATURE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Parent group (optional)</label>
                                <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputClassName}>
                                    <option value="">— Top level —</option>
                                    {groupOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                            </div>
                        </>
                    )}

                    {action === 'supplier' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Phone</label>
                                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClassName} placeholder="optional" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">GSTIN</label>
                                    <input value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} maxLength={15} className={inputClassName} placeholder="optional" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Opening balance (payable)</label>
                                <input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} className={inputClassName} placeholder="0" />
                            </div>
                        </>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={close} className="px-4 py-2 rounded-xl text-sm bg-slate-800 text-slate-300">Cancel</button>
                        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-50">
                            {busy ? 'Saving…' : 'Create'}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

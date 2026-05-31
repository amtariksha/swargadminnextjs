'use client';

import { useState } from 'react';
import { useReminderRules, ReminderRule, ReminderLogEntry } from '@/hooks/useAccounting';
import { formatDateTime } from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus, Edit, Trash2, BellRing } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const CHANNEL_OPTIONS = ['whatsapp', 'email', 'sms', 'bell'];

const blankForm = { offset_days: '', channels: 'whatsapp', template_title: '', active: true };

/** Human phrasing for a reminder offset. neg = before due, 0 = on due, pos = overdue. */
function offsetLabel(days: number): string {
    if (days < 0) return `${Math.abs(days)} day(s) before due`;
    if (days === 0) return 'On due date';
    return `${days} day(s) overdue`;
}

export default function RemindersPage() {
    const { data, isLoading, refetch } = useReminderRules();
    const rules = data?.rules || [];
    const log = data?.recent_log || [];

    const [editItem, setEditItem] = useState<ReminderRule | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(blankForm);
    const [saving, setSaving] = useState(false);
    const [deleteItem, setDeleteItem] = useState<ReminderRule | null>(null);

    const openAdd = () => { setEditItem(null); setForm(blankForm); setShowForm(true); };
    const openEdit = (r: ReminderRule) => {
        setEditItem(r);
        setForm({
            offset_days: String(r.offset_days),
            channels: r.channels || 'whatsapp',
            template_title: r.template_title || '',
            active: !!r.active,
        });
        setShowForm(true);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.offset_days === '') { toast.error('Enter an offset'); return; }
        setSaving(true);
        try {
            const body = {
                offset_days: Number(form.offset_days),
                channels: form.channels,
                template_title: form.template_title.trim() || null,
                active: form.active ? 1 : 0,
            };
            if (editItem) await PUT(`/accounting/reminders/rules/${editItem.id}`, body);
            else await POST('/accounting/reminders/rules', body);
            toast.success(editItem ? 'Rule updated' : 'Rule added');
            setShowForm(false);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save rule');
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteItem) return;
        setSaving(true);
        try {
            await DELETE(`/accounting/reminders/rules/${deleteItem.id}`);
            toast.success('Rule removed');
            setDeleteItem(null);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete');
        } finally {
            setSaving(false);
        }
    };

    const ruleColumns: Column<ReminderRule>[] = [
        {
            key: 'edit', header: '', width: '60px', sortable: false,
            render: (r) => (
                <button onClick={() => openEdit(r)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        { key: 'offset_days', header: 'Cadence', render: (r) => offsetLabel(Number(r.offset_days)) },
        {
            key: 'channels', header: 'Channels',
            render: (r) => (
                <div className="flex gap-1 flex-wrap">
                    {(r.channels || '').split(',').filter(Boolean).map((c) => (
                        <span key={c} className="text-xs px-2 py-0.5 rounded-lg bg-slate-700/50 text-slate-300">{c.trim()}</span>
                    ))}
                </div>
            ),
        },
        { key: 'template_title', header: 'Template', render: (r) => r.template_title || <span className="text-slate-600">—</span> },
        {
            key: 'active', header: 'Active', width: '90px',
            render: (r) => (
                r.active
                    ? <span className="text-xs px-2 py-1 rounded-lg bg-green-500/20 text-green-400">Active</span>
                    : <span className="text-xs px-2 py-1 rounded-lg bg-slate-700/50 text-slate-400">Off</span>
            ),
        },
        {
            key: 'del', header: '', width: '60px', sortable: false,
            render: (r) => (
                <button onClick={() => setDeleteItem(r)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <Trash2 className="w-4 h-4 text-red-400" />
                </button>
            ),
        },
    ];

    const logColumns: Column<ReminderLogEntry>[] = [
        { key: 'sent_at', header: 'Sent', width: '170px', render: (l) => formatDateTime(l.sent_at) },
        { key: 'invoice_id', header: 'Invoice', width: '100px', render: (l) => `#${l.invoice_id}` },
        { key: 'channel', header: 'Channel', width: '120px' },
        {
            key: 'status', header: 'Status',
            render: (l) => (
                <span className={`text-xs px-2 py-1 rounded-lg ${
                    l.status === 'sent' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/50 text-slate-400'
                }`}>{l.status || '—'}</span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Payment reminders</h1>
                    <p className="text-slate-400">Cadence rules relative to invoice due date — dispatched via the notification engine</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm">
                    <Plus className="w-4 h-4" /> Add rule
                </button>
            </div>

            <DataTable data={rules} columns={ruleColumns} loading={isLoading} pageSize={20}
                title="Cadence rules" searchable={false} exportable={false}
                emptyMessage="No reminder rules — add one to start nudging overdue customers" />

            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-3">
                    <BellRing className="w-4 h-4 text-purple-400" /> Recent sends
                </h2>
                <DataTable data={log} columns={logColumns} pageSize={20}
                    searchable={false} exportable={false} emptyMessage="No reminders sent yet" />
            </div>

            <Modal isOpen={showForm} onClose={() => setShowForm(false)}
                title={editItem ? 'Edit reminder rule' : 'Add reminder rule'} size="md">
                <form onSubmit={save} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Offset days *</label>
                        <input type="number" value={form.offset_days} placeholder="-3 = 3 days before, 0 = on due, 7 = 7 days overdue"
                            onChange={(e) => setForm({ ...form, offset_days: e.target.value })} className={inputCls} />
                        {form.offset_days !== '' && (
                            <p className="text-xs text-purple-400 mt-1">{offsetLabel(Number(form.offset_days))}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Channels</label>
                        <div className="flex gap-2 flex-wrap">
                            {CHANNEL_OPTIONS.map((c) => {
                                const selected = form.channels.split(',').map((x) => x.trim()).filter(Boolean);
                                const on = selected.includes(c);
                                return (
                                    <button type="button" key={c}
                                        onClick={() => {
                                            const next = on ? selected.filter((x) => x !== c) : [...selected, c];
                                            setForm({ ...form, channels: next.join(',') });
                                        }}
                                        className={`px-3 py-1.5 text-xs rounded-lg border ${
                                            on
                                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                                : 'bg-slate-800/50 text-slate-400 border-slate-700/50'
                                        }`}>
                                        {c}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Template title</label>
                        <input type="text" value={form.template_title} placeholder="payment_reminder"
                            onChange={(e) => setForm({ ...form, template_title: e.target.value })} className={inputCls} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" checked={form.active}
                            onChange={(e) => setForm({ ...form, active: e.target.checked })}
                            className="w-4 h-4 rounded bg-slate-800 border-slate-600" />
                        Active
                    </label>
                    <div className="flex gap-3 pt-2 justify-end">
                        <button type="button" onClick={() => setShowForm(false)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                        <button type="submit" disabled={saving}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {saving ? 'Saving…' : editItem ? 'Save' : 'Add rule'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteItem}
                title="Remove reminder rule"
                message={`Remove the "${deleteItem ? offsetLabel(Number(deleteItem.offset_days)) : ''}" rule?`}
                confirmText="Remove"
                variant="danger"
                isLoading={saving}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteItem(null)}
            />
        </div>
    );
}

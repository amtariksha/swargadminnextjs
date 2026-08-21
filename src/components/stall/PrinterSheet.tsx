'use client';

/**
 * Printer setup for one device.
 *
 * A bottom sheet rather than an admin settings page, because the person who
 * needs it is standing at a stall with a printer in one hand: it has to be
 * reachable from the till in one tap, and every control has to be thumb-sized.
 *
 * Everything here is per-device (localStorage) — see lib/stall/printer.ts for
 * why that is not a stall-level setting.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Bluetooth, Check, Loader2, Printer, X } from 'lucide-react';
import {
    type PrinterConfig, type PrinterMode,
    bluetoothSupported, getPrinterConfig, pairBluetoothPrinter, pairedPrinterName,
    printTokenTicket, sampleTicket, setPrinterConfig,
} from '@/lib/stall/printer';

const MODES: { key: PrinterMode; title: string; blurb: string }[] = [
    { key: 'off', title: 'No printer', blurb: 'Tokens stay on the screen only.' },
    {
        key: 'bluetooth',
        title: 'Bluetooth thermal printer',
        blurb: 'Prints straight to the roll, no dialog. Chrome on Android. Best at a stall.',
    },
    {
        key: 'rawbt',
        title: 'RawBT app',
        blurb: 'Use when the printer will not pair with Chrome directly. Install RawBT from Play Store first.',
    },
    {
        key: 'browser',
        title: 'System print dialog',
        blurb: 'Any printer the device can already print to. One extra tap per sale.',
    },
];

export default function PrinterSheet({ open, onClose, stallTitle }: {
    open: boolean;
    onClose: () => void;
    stallTitle: string;
}) {
    const [config, setConfig] = useState<PrinterConfig>(getPrinterConfig);
    const [pairing, setPairing] = useState(false);
    const [testing, setTesting] = useState(false);
    const [paired, setPaired] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    // Re-read on open: another tab (or the queue's own sheet) may have changed it.
    useEffect(() => {
        if (!open) return;
        setConfig(getPrinterConfig());
        setPaired(pairedPrinterName());
    }, [open]);

    const update = useCallback((patch: Partial<PrinterConfig>) => {
        setConfig((prev) => {
            const next = { ...prev, ...patch };
            setPrinterConfig(next);
            return next;
        });
    }, []);

    const pair = useCallback(async () => {
        setPairing(true);
        try {
            setPaired(await pairBluetoothPrinter());
            toast.success('Printer paired');
        } catch (err) {
            // A cancelled chooser rejects too; saying "not paired" covers both
            // without accusing the operator of an error they did not make.
            const message = err instanceof Error ? err.message : 'Could not pair with that printer.';
            toast.error(/cancel|user/i.test(message) ? 'No printer picked' : message);
        } finally {
            setPairing(false);
        }
    }, []);

    const test = useCallback(async () => {
        setTesting(true);
        try {
            const printed = await printTokenTicket(sampleTicket(stallTitle), { force: true, config });
            if (!printed) toast.error('Pick a printer above first');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'The test slip did not print.');
        } finally {
            setTesting(false);
        }
    }, [config, stallTitle]);

    if (!mounted || !open) return null;

    // Portalled to <body>: the till is inside a backdrop-filtered shell, which
    // makes it a containing block for position:fixed and would clip the sheet.
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Printer setup"
                className="relative w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-slate-950 border border-slate-800 p-4 space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                        <Printer className="w-5 h-5 text-emerald-400" /> Printer
                    </h2>
                    <button onClick={onClose} aria-label="Close"
                        className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-xs text-slate-500">
                    Saved on this device only. Another tablet at the same stall keeps its own setting.
                </p>

                <div className="space-y-2">
                    {MODES.map((m) => {
                        const unavailable = m.key === 'bluetooth' && !bluetoothSupported();
                        const active = config.mode === m.key;
                        return (
                            <button
                                key={m.key}
                                onClick={() => update({ mode: m.key })}
                                disabled={unavailable}
                                className={`w-full text-left p-3 rounded-2xl border transition-colors disabled:opacity-40 ${
                                    active
                                        ? 'bg-emerald-600/15 border-emerald-500/50'
                                        : 'bg-slate-900 border-slate-800 active:bg-slate-800'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-sm text-white">{m.title}</span>
                                    {active && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    {unavailable
                                        ? 'This browser has no Bluetooth access — use RawBT or the system dialog.'
                                        : m.blurb}
                                </p>
                            </button>
                        );
                    })}
                </div>

                {config.mode === 'bluetooth' && (
                    <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                        <button onClick={pair} disabled={pairing}
                            className="w-full py-3 rounded-xl bg-sky-600 active:bg-sky-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                            {pairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                            {paired ? 'Pair a different printer' : 'Pair printer'}
                        </button>
                        <p className="text-[11px] text-slate-400">
                            {paired
                                ? `Connected to ${paired}.`
                                : 'Switch the printer on, then pick it from the list Android shows.'}
                            {' '}Reloading this page needs one more tap here to reconnect.
                        </p>
                    </div>
                )}

                {config.mode !== 'off' && (
                    <div className="space-y-3">
                        <Row label="Paper width">
                            <Segmented
                                options={[{ v: 32, l: '58 mm' }, { v: 48, l: '80 mm' }]}
                                value={config.chars}
                                onChange={(v) => update({ chars: v as 32 | 48 })}
                            />
                        </Row>
                        <Row label="Copies">
                            <Segmented
                                options={[{ v: 1, l: '1' }, { v: 2, l: '2' }]}
                                value={config.copies}
                                onChange={(v) => update({ copies: v as 1 | 2 })}
                            />
                        </Row>
                        <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800">
                            <span className="text-sm">
                                Print automatically on every sale
                                <span className="block text-[11px] text-slate-500">
                                    Off means you print from the queue when you want a slip.
                                </span>
                            </span>
                            <input
                                type="checkbox"
                                checked={config.auto}
                                onChange={(e) => update({ auto: e.target.checked })}
                                className="w-6 h-6 accent-emerald-500 flex-shrink-0"
                            />
                        </label>

                        <button onClick={test} disabled={testing}
                            className="w-full py-3.5 rounded-xl bg-slate-800 active:bg-slate-700 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                            Print a test slip
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-300">{label}</span>
        {children}
    </div>
);

function Segmented({ options, value, onChange }: {
    options: { v: number; l: string }[];
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="flex rounded-xl border border-slate-800 overflow-hidden">
            {options.map((o) => (
                <button
                    key={o.v}
                    onClick={() => onChange(o.v)}
                    className={`px-4 py-2 text-sm ${
                        value === o.v ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-300'
                    }`}
                >
                    {o.l}
                </button>
            ))}
        </div>
    );
}

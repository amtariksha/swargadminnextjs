/**
 * Stall POS — printing a physical token.
 *
 * A market stall hands the customer a slip with a number on it and keeps the
 * counter working from the board. That slip has to come out of a printer within
 * a second of taking the money, so this is built around what is actually on a
 * stall table in Bangalore: a 58mm Bluetooth thermal printer.
 *
 * Three drivers, because there is no single one that works everywhere:
 *
 *   bluetooth  Web Bluetooth → raw ESC/POS straight to the printer. No app to
 *              install, no print dialog, ~1 second. Chrome on Android over
 *              HTTPS only. This is the one to use at a stall.
 *   rawbt      The RawBT Android app via its `rawbt:` URL scheme. The fallback
 *              when a printer's BLE stack will not talk to Chrome — RawBT ships
 *              drivers for a much wider set of hardware, including USB and
 *              classic (non-BLE) Bluetooth, which Web Bluetooth cannot reach.
 *   browser    window.print() into a hidden iframe, styled to the roll width.
 *              Goes through the OS print dialog, so it covers a laptop on a
 *              desk and any printer with an Android print service. One extra
 *              tap per sale, which is why it is not the default at a counter.
 *
 * The choice lives in localStorage, NOT on the stall row: a printer is attached
 * to a device, and two tablets working the same stall can legitimately have
 * different ones (or none, for whoever is only taking payments).
 *
 * Nothing here throws into the sale path. A sale that succeeded must never be
 * reported as failed because a printer was out of paper — callers surface a
 * print failure as its own toast with a Reprint action.
 */

/* ────────────────────────────── the ticket ────────────────────────────── */

export interface TicketLine {
    label: string;
    sizeText?: string | null;
    qty: number;
    /** Omitted on a reprint from the board, which does not carry unit prices. */
    lineTotal?: number | null;
}

export interface TokenTicket {
    stallTitle: string;
    stallLocation?: string | null;
    token: number | null;
    orderNo?: number | null;
    /** Rendered as-is; the caller decides the timezone. */
    placedAt: string;
    lines: TicketLine[];
    total: number;
    /** 'CASH' / 'UPI' / 'PAYMENT LINK' / 'AWAITING PAYMENT'. */
    paymentLabel: string;
    phone?: string | null;
    note?: string | null;
}

export type PrinterMode = 'off' | 'bluetooth' | 'rawbt' | 'browser';

export interface PrinterConfig {
    mode: PrinterMode;
    /** Characters per line: 32 for a 58mm roll, 48 for 80mm. */
    chars: 32 | 48;
    /** Print automatically the moment a sale settles. */
    auto: boolean;
    /** Two slips per sale — one for the customer, one for the counter. */
    copies: 1 | 2;
}

const STORAGE_KEY = 'stall_printer_config';

const DEFAULT_CONFIG: PrinterConfig = {
    // Default OFF, deliberately. A stall with no printer must not get a print
    // dialog over the till after every sale, and the operator who does have one
    // sets it up once per device.
    mode: 'off',
    chars: 32,
    auto: true,
    copies: 1,
};

export function getPrinterConfig(): PrinterConfig {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_CONFIG;
        const saved = JSON.parse(raw) as Partial<PrinterConfig>;
        return {
            mode: (['off', 'bluetooth', 'rawbt', 'browser'] as const)
                .includes(saved.mode as PrinterMode) ? saved.mode as PrinterMode : DEFAULT_CONFIG.mode,
            chars: saved.chars === 48 ? 48 : 32,
            auto: saved.auto !== false,
            copies: saved.copies === 2 ? 2 : 1,
        };
    } catch {
        return DEFAULT_CONFIG;
    }
}

export function setPrinterConfig(next: PrinterConfig): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        /* private-mode storage refusal — the session keeps its in-memory copy */
    }
}

/* ─────────────────────────── text composition ─────────────────────────── */

/**
 * `₹` is not in CP437 and prints as garbage on cheap thermal heads, so the
 * ESC/POS and RawBT paths spell it out. The browser path uses the real symbol.
 */
const rupeesAscii = (n: number) => `Rs.${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

const centre = (text: string, width: number) => {
    if (text.length >= width) return text.slice(0, width);
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(pad) + text;
};

/** "2x Alphonso Mango" on the left, "Rs.200" hard against the right margin. */
const columns = (left: string, right: string, width: number) => {
    const room = width - right.length - 1;
    const trimmed = left.length > room ? `${left.slice(0, room - 1)}…` : left;
    return trimmed + ' '.repeat(Math.max(1, width - trimmed.length - right.length)) + right;
};

/** Wrap a label onto continuation lines rather than truncating it. */
function wrap(text: string, width: number, indent = ''): string[] {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length + indent.length <= width) { line = candidate; continue; }
        if (line) out.push(indent + line);
        line = word.length + indent.length > width ? word.slice(0, width - indent.length) : word;
    }
    if (line) out.push(indent + line);
    return out;
}

/**
 * The slip as monospace text. Shared by every driver so all three produce the
 * same layout — and so it can be unit-tested without a printer.
 */
export function buildTicketText(ticket: TokenTicket, width = 32): string[] {
    const rule = '-'.repeat(width);
    const out: string[] = [];

    out.push(centre('SWARG FOOD', width));
    if (ticket.stallTitle) out.push(...wrap(ticket.stallTitle, width).map((l) => centre(l.trim(), width)));
    if (ticket.stallLocation) out.push(...wrap(ticket.stallLocation, width).map((l) => centre(l.trim(), width)));
    out.push(rule);
    out.push(centre(`TOKEN ${ticket.token ?? '--'}`, width));
    out.push(rule);
    out.push(ticket.placedAt);
    if (ticket.orderNo) out.push(`Order #${ticket.orderNo}`);
    out.push(rule);

    for (const line of ticket.lines) {
        const qty = `${line.qty}x `;
        const amount = line.lineTotal == null ? '' : rupeesAscii(line.lineTotal);
        const [first, ...rest] = wrap(line.label, width - qty.length - (amount.length ? amount.length + 1 : 0));
        out.push(columns(qty + (first ?? line.label), amount, width));
        for (const cont of rest) out.push(' '.repeat(qty.length) + cont);
        if (line.sizeText) out.push(' '.repeat(qty.length) + line.sizeText);
    }

    out.push(rule);
    out.push(columns('TOTAL', rupeesAscii(ticket.total), width));
    out.push(columns('Paid', ticket.paymentLabel, width));
    if (ticket.phone) out.push(columns('Phone', ticket.phone, width));
    if (ticket.note) out.push(...wrap(ticket.note, width));
    out.push(rule);
    out.push(centre('Please collect at the counter', width));
    out.push(centre('swargfood.com', width));
    return out;
}

/* ───────────────────────────── ESC/POS bytes ──────────────────────────── */

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Latin-1 bytes. Thermal printers default to a single-byte code page, so a
 * TextEncoder (UTF-8) would emit two bytes for anything non-ASCII and print two
 * garbage glyphs. Everything outside the range becomes '?', which is honest.
 */
function latin1(text: string): number[] {
    const out: number[] = [];
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 63;
        out.push(code <= 0xff ? code : 0x3f);
    }
    return out;
}

export function buildEscPos(ticket: TokenTicket, width: 32 | 48 = 32): Uint8Array {
    const bytes: number[] = [];
    const push = (...b: number[]) => bytes.push(...b);
    const text = (s: string) => push(...latin1(s));
    const feed = (n = 1) => push(...Array(n).fill(0x0a));

    push(ESC, 0x40);                       // initialise
    push(ESC, 0x74, 0x00);                 // code page 437

    const lines = buildTicketText(ticket, width);
    // The token is the whole point of the slip and gets read from across a
    // counter, so it is reprinted at double size instead of being left in the
    // body text at the same 9pt as the date.
    const tokenLine = lines.findIndex((l) => l.trim().startsWith('TOKEN '));

    lines.forEach((line, i) => {
        if (i === tokenLine) {
            push(ESC, 0x61, 0x01);         // centre
            push(GS, 0x21, 0x11);          // double width + height
            push(ESC, 0x45, 0x01);         // bold on
            text(line.trim());
            feed();
            push(ESC, 0x45, 0x00);
            push(GS, 0x21, 0x00);
            push(ESC, 0x61, 0x00);         // back to left
            return;
        }
        text(line);
        feed();
    });

    feed(4);                               // clear the tear bar
    push(GS, 0x56, 0x42, 0x00);            // feed and partial cut (ignored if none)
    return Uint8Array.from(bytes);
}

/* ───────────────────────────── Web Bluetooth ──────────────────────────── */

/**
 * Serial-over-GATT service/characteristic pairs used by the common thermal
 * printer chipsets. There is no standard for this: every vendor picked their
 * own, so the connect path tries each in turn.
 */
const BT_TARGETS: { service: string; characteristic: string }[] = [
    { service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '00002af1-0000-1000-8000-00805f9b34fb' },
    { service: '0000ffe0-0000-1000-8000-00805f9b34fb', characteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' },
    { service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff02-0000-1000-8000-00805f9b34fb' },
    { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
    { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', characteristic: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
];

// Minimal Web Bluetooth surface. `@types/web-bluetooth` is not a dependency and
// pulling one in for five call sites is not worth the install.
interface BtCharacteristic {
    writeValue(value: BufferSource): Promise<void>;
    writeValueWithoutResponse?(value: BufferSource): Promise<void>;
}
interface BtService { getCharacteristic(uuid: string): Promise<BtCharacteristic> }
interface BtServer { connected: boolean; connect(): Promise<BtServer>; getPrimaryService(uuid: string): Promise<BtService> }
interface BtDevice { id: string; name?: string | null; gatt?: BtServer }
interface BtNavigator {
    bluetooth?: {
        requestDevice(options: unknown): Promise<BtDevice>;
        getDevices?(): Promise<BtDevice[]>;
    };
}

const bt = () => (typeof navigator === 'undefined' ? undefined : (navigator as unknown as BtNavigator).bluetooth);

export const bluetoothSupported = () => Boolean(bt());

/**
 * The paired device, held for the life of the page.
 *
 * Web Bluetooth cannot silently re-pair: `requestDevice` needs a user gesture
 * and shows the OS chooser. So pairing is an explicit button in the printer
 * sheet, and this holds the handle until the tab is closed — a reload means one
 * tap to reconnect, which is why the setup sheet says so.
 */
let pairedDevice: BtDevice | null = null;
let pairedCharacteristic: BtCharacteristic | null = null;

export function pairedPrinterName(): string | null {
    return pairedDevice?.name || null;
}

async function openCharacteristic(device: BtDevice): Promise<BtCharacteristic> {
    if (!device.gatt) throw new Error('This device does not expose a printer service.');
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    for (const target of BT_TARGETS) {
        try {
            const service = await server.getPrimaryService(target.service);
            return await service.getCharacteristic(target.characteristic);
        } catch {
            // Wrong chipset for this UUID pair — try the next.
        }
    }
    throw new Error('Connected, but this printer speaks none of the profiles we know.');
}

/** Show the OS chooser and remember the pick. Must be called from a user tap. */
export async function pairBluetoothPrinter(): Promise<string> {
    const api = bt();
    if (!api) throw new Error('This browser cannot talk to Bluetooth printers. Use Chrome on Android, or switch to RawBT.');
    const device = await api.requestDevice({
        // Thermal printers advertise wildly inconsistent names ('MTP-2', 'BlueTooth
        // Printer', 'PT-210'), so filtering by name would hide half of them.
        acceptAllDevices: true,
        optionalServices: BT_TARGETS.map((t) => t.service),
    });
    pairedCharacteristic = await openCharacteristic(device);
    pairedDevice = device;
    return device.name || 'Printer';
}

async function writeBluetooth(payload: Uint8Array): Promise<void> {
    if (!pairedDevice) {
        // A permission granted earlier in the session can be reopened without the
        // chooser; a fresh page load usually cannot, and says so.
        const known = await bt()?.getDevices?.().catch(() => [] as BtDevice[]);
        const first = known?.[0];
        if (!first) throw new Error('No printer paired on this device yet.');
        pairedCharacteristic = await openCharacteristic(first);
        pairedDevice = first;
    }
    if (!pairedCharacteristic) pairedCharacteristic = await openCharacteristic(pairedDevice);

    // BLE writes are capped by the negotiated MTU; 100 bytes is under every
    // default. Without-response is markedly faster and is what the printer
    // firmware expects, but not every stack implements it.
    const CHUNK = 100;
    for (let at = 0; at < payload.length; at += CHUNK) {
        const slice = payload.slice(at, at + CHUNK);
        if (pairedCharacteristic.writeValueWithoutResponse) {
            await pairedCharacteristic.writeValueWithoutResponse(slice);
        } else {
            await pairedCharacteristic.writeValue(slice);
        }
        // The print head buffers slowly; hammering it drops bytes mid-slip.
        await new Promise((r) => setTimeout(r, 20));
    }
}

/* ─────────────────────────────── RawBT ────────────────────────────────── */

/**
 * RawBT takes plain text (or ESC/POS) on a `rawbt:` URL. Navigating to it fires
 * an Android intent; the page itself does not change.
 */
function printViaRawBt(lines: string[]): void {
    const body = `${lines.join('\n')}\n\n\n`;
    window.location.href = `rawbt:${encodeURIComponent(body)}`;
}

/* ────────────────────────────── browser ───────────────────────────────── */

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'
));

/**
 * Print through the OS dialog, in a detached iframe.
 *
 * Printing the live document would drag the whole dark admin shell onto the
 * page and need a print stylesheet fighting Tailwind. An iframe with its own
 * document is smaller, and cannot affect what is on screen mid-sale.
 */
function printViaBrowser(ticket: TokenTicket, width: 32 | 48): Promise<void> {
    return new Promise((resolve, reject) => {
        const mm = width === 48 ? 80 : 58;
        const rows = ticket.lines.map((l) => `
            <tr>
              <td class="q">${l.qty}&times;</td>
              <td>${escapeHtml(l.label)}${l.sizeText ? `<div class="sub">${escapeHtml(l.sizeText)}</div>` : ''}</td>
              <td class="amt">${l.lineTotal == null ? '' : `₹${l.lineTotal.toFixed(l.lineTotal % 1 === 0 ? 0 : 2)}`}</td>
            </tr>`).join('');

        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Token ${ticket.token ?? ''}</title>
<style>
  @page { size: ${mm}mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-monospace, "Courier New", monospace; font-size: 11px;
         color:#000; background:#fff; width: ${mm - 6}mm; }
  .c { text-align:center; }
  .brand { font-weight:700; font-size:13px; letter-spacing:.06em; }
  .stall { font-size:11px; }
  .rule { border-top:1px dashed #000; margin:4px 0; }
  .token { font-size:34px; font-weight:800; line-height:1.05; margin:2px 0; }
  table { width:100%; border-collapse:collapse; }
  td { vertical-align:top; padding:1px 0; }
  td.q { width:9%; white-space:nowrap; }
  td.amt { width:26%; text-align:right; white-space:nowrap; }
  .sub { font-size:9px; }
  .total { display:flex; justify-content:space-between; font-weight:800; font-size:13px; }
  .row { display:flex; justify-content:space-between; }
  .foot { font-size:9px; margin-top:4px; }
</style></head><body>
  <div class="c brand">SWARG FOOD</div>
  <div class="c stall">${escapeHtml(ticket.stallTitle)}</div>
  ${ticket.stallLocation ? `<div class="c stall">${escapeHtml(ticket.stallLocation)}</div>` : ''}
  <div class="rule"></div>
  <div class="c">TOKEN</div>
  <div class="c token">${ticket.token ?? '--'}</div>
  <div class="rule"></div>
  <div class="row"><span>${escapeHtml(ticket.placedAt)}</span>${ticket.orderNo ? `<span>#${ticket.orderNo}</span>` : ''}</div>
  <div class="rule"></div>
  <table>${rows}</table>
  <div class="rule"></div>
  <div class="total"><span>TOTAL</span><span>₹${ticket.total.toFixed(ticket.total % 1 === 0 ? 0 : 2)}</span></div>
  <div class="row"><span>Paid</span><span>${escapeHtml(ticket.paymentLabel)}</span></div>
  ${ticket.phone ? `<div class="row"><span>Phone</span><span>${escapeHtml(ticket.phone)}</span></div>` : ''}
  ${ticket.note ? `<div>${escapeHtml(ticket.note)}</div>` : ''}
  <div class="rule"></div>
  <div class="c foot">Please collect at the counter</div>
  <div class="c foot">swargfood.com</div>
</body></html>`;

        const frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        frame.srcdoc = html;
        let settled = false;
        const cleanup = () => {
            // Removing the frame the instant print() returns kills the job on
            // some Android builds, which print asynchronously.
            window.setTimeout(() => frame.remove(), 2000);
        };
        frame.onload = () => {
            try {
                frame.contentWindow?.focus();
                frame.contentWindow?.print();
                settled = true;
                resolve();
            } catch (err) {
                reject(err instanceof Error ? err : new Error('The print dialog could not be opened.'));
            } finally {
                cleanup();
            }
        };
        frame.onerror = () => {
            if (!settled) reject(new Error('The receipt could not be rendered.'));
            cleanup();
        };
        document.body.appendChild(frame);
    });
}

/* ──────────────────────────────── entry ───────────────────────────────── */

/**
 * Print one token slip. Resolves `false` when printing is switched off, which
 * is not an error — most callers ignore it.
 *
 * @param force ignore `config.auto` (the Reprint / Test buttons).
 */
export async function printTokenTicket(
    ticket: TokenTicket,
    { force = false, config = getPrinterConfig() }: { force?: boolean; config?: PrinterConfig } = {},
): Promise<boolean> {
    if (config.mode === 'off') return false;
    if (!force && !config.auto) return false;

    for (let copy = 0; copy < config.copies; copy += 1) {
        if (config.mode === 'bluetooth') {
            await writeBluetooth(buildEscPos(ticket, config.chars));
        } else if (config.mode === 'rawbt') {
            printViaRawBt(buildTicketText(ticket, config.chars));
        } else {
            await printViaBrowser(ticket, config.chars);
            // The OS dialog is modal — a second copy would queue behind it and
            // is the operator's job to ask for, not ours.
            break;
        }
    }
    return true;
}

/** A slip with recognisable content, for the setup sheet's Test button. */
export function sampleTicket(stallTitle: string): TokenTicket {
    return {
        stallTitle: stallTitle || 'Test stall',
        stallLocation: null,
        token: 88,
        orderNo: null,
        placedAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        lines: [
            { label: 'Alphonso Mango', sizeText: '1 Scoop', qty: 2, lineTotal: 200 },
            { label: 'Chole Papdi Chaat', sizeText: null, qty: 1, lineTotal: 130 },
        ],
        total: 330,
        paymentLabel: 'TEST PRINT',
        phone: null,
        note: 'This is a test slip — no sale was recorded.',
    };
}

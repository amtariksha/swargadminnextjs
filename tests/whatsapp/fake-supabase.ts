// In-memory stand-in for the supabase-js query builder, shared by the tests/whatsapp suites
// (planner-approved helper, P1d O-3). Tables are arrays of rows; a query runs when it is awaited.
//
// Supported chain: select, insert, update, delete, eq, neq, is, in, lt, gte, like, ilike, or (eq
// terms only), order, limit, abortSignal, maybeSingle, single, then. Unique rules: contacts.phone,
// and conversations (contact_id, integrated_number) while store.uniqueConversations is true; both
// answer { code: "23505" } like Postgres. Hooks: store.beforeInsert(table, row) runs before the
// unique check and store.beforeUpdate(table) before an update matches rows (both simulate a racing
// request); store.failNext["<table>.<action>"] makes the next such call fail once. A select naming contacts(...) attaches the contact row. Every executed call
// is recorded in store.calls.

export type Row = Record<string, unknown>;
export type Action = "select" | "insert" | "update" | "delete";
export interface FakeError { code: string; message: string }
export interface FakeResult { data: unknown; error: FakeError | null }
/** code = answer with this error; throws = the await rejects. */
export interface FailSpec { code?: string; throws?: boolean }
export interface FakeCall { table: string; action: Action; payload: unknown }

export interface FakeStore {
    tables: Record<string, Row[]>;
    calls: FakeCall[];
    uniqueConversations: boolean;
    failNext: Record<string, FailSpec | undefined>;
    beforeInsert: ((table: string, row: Row) => void) | null;
    beforeUpdate: ((table: string) => void) | null;
    nextId: number;
}

export function createFakeStore(): FakeStore {
    return { tables: {}, calls: [], uniqueConversations: true, failNext: {}, beforeInsert: null, beforeUpdate: null, nextId: 1 };
}

/** The store the vi.mock of @/lib/whatsapp/supabase serves; reset it in beforeEach. */
export const fakeStore: FakeStore = createFakeStore();

export function resetFakeStore(tables: Record<string, Row[]> = {}): FakeStore {
    Object.assign(fakeStore, createFakeStore(), { tables });
    return fakeStore;
}

/** One-shot race: the next insert into `table` first finds `competitor` already stored. */
export function raceInsert(store: FakeStore, table: string, competitor: Row): void {
    let fired = false;
    store.beforeInsert = (target) => {
        if (fired || target !== table) return;
        fired = true;
        (store.tables[table] ??= []).push(competitor);
    };
}

export const callsOf = (store: FakeStore, table: string, action?: Action): FakeCall[] =>
    store.calls.filter((call) => call.table === table && (action === undefined || call.action === action));

type Filter = (row: Row) => boolean;

const asTime = (value: unknown): number => (typeof value === "string" ? Date.parse(value) : Number.NaN);
function compare(a: unknown, b: unknown): number {
    if (typeof a === "number" || typeof b === "number") return Number(a) - Number(b);
    const ta = asTime(a);
    const tb = asTime(b);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
    return String(a).localeCompare(String(b));
}
function likeToRegExp(pattern: string, flags: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
    return new RegExp(`^${escaped}$`, flags);
}
/** Top-level comma split: "id, contacts(*)" -> ["id", "contacts(*)"]. */
function splitColumns(columns: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of columns) {
        if (char === "(") depth += 1;
        if (char === ")") depth -= 1;
        if (char === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    if (current.trim() !== "") parts.push(current.trim());
    return parts;
}

export class FakeQuery implements PromiseLike<FakeResult> {
    private action: Action = "select";
    private payload: unknown = null;
    private columns: string | null = null;
    private returning = false;
    private filters: Filter[] = [];
    private sortBy: { column: string; ascending: boolean } | null = null;
    private cap = Infinity;
    private mode: "many" | "single" | "maybe" = "many";

    constructor(private readonly store: FakeStore, private readonly table: string) {}

    select(columns = "*") {
        this.columns = columns;
        if (this.action !== "select") this.returning = true;
        return this;
    }
    insert(payload: Row | Row[]) { this.action = "insert"; this.payload = payload; return this; }
    update(patch: Row) { this.action = "update"; this.payload = patch; return this; }
    delete() { this.action = "delete"; return this; }
    eq(column: string, value: unknown) { return this.where((row) => row[column] === value); }
    neq(column: string, value: unknown) { return this.where((row) => row[column] !== value); }
    is(column: string, value: null) { return this.where((row) => (row[column] ?? null) === value); }
    in(column: string, values: readonly unknown[]) { return this.where((row) => values.includes(row[column])); }
    lt(column: string, value: unknown) { return this.where((row) => row[column] != null && compare(row[column], value) < 0); }
    gte(column: string, value: unknown) { return this.where((row) => row[column] != null && compare(row[column], value) >= 0); }
    like(column: string, pattern: string) { return this.where((row) => likeToRegExp(pattern, "").test(String(row[column] ?? ""))); }
    ilike(column: string, pattern: string) { return this.where((row) => likeToRegExp(pattern, "i").test(String(row[column] ?? ""))); }
    or(expression: string) {
        const terms = expression.split(",").map((term) => {
            const [column, operator, ...rest] = term.split(".");
            if (operator !== "eq") throw new Error(`fake or() supports eq only, got ${operator}`);
            return { column, value: rest.join(".") };
        });
        return this.where((row) => terms.some((term) => String(row[term.column] ?? "") === term.value));
    }
    order(column: string, options?: { ascending?: boolean }) { this.sortBy = { column, ascending: options?.ascending !== false }; return this; }
    limit(count: number) { this.cap = count; return this; }
    abortSignal(signal: AbortSignal) { void signal; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    single() { this.mode = "single"; return this; }

    then<A = FakeResult, B = never>(
        onfulfilled?: ((value: FakeResult) => A | PromiseLike<A>) | null,
        onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): Promise<A | B> {
        return this.execute().then(onfulfilled, onrejected);
    }

    private where(test: Filter) { this.filters.push(test); return this; }

    private async execute(): Promise<FakeResult> {
        this.store.calls.push({ table: this.table, action: this.action, payload: this.payload });
        const key = `${this.table}.${this.action}`;
        const fail = this.store.failNext[key];
        if (fail) {
            delete this.store.failNext[key];
            if (fail.throws) throw new Error(`fake ${key} failure`);
            return { data: null, error: { code: fail.code ?? "XX000", message: `fake ${key} failure` } };
        }
        if (this.action === "update") this.store.beforeUpdate?.(this.table);
        const rows = this.store.tables[this.table] ??= [];
        if (this.action === "insert") return this.runInsert(rows);
        const matched = this.matches(rows);
        if (this.action === "update") {
            const patch = this.payload as Row;
            const updated = matched.map((row) => ({ ...row, ...patch }));
            this.store.tables[this.table] = rows.map((row) => updated[matched.indexOf(row)] ?? row);
            return this.returning ? this.shape(updated) : { data: null, error: null };
        }
        if (this.action === "delete") {
            this.store.tables[this.table] = rows.filter((row) => !matched.includes(row));
            return this.returning ? this.shape(matched) : { data: null, error: null };
        }
        return this.shape(matched.slice(0, this.cap));
    }

    private matches(rows: Row[]): Row[] {
        const found = rows.filter((row) => this.filters.every((test) => test(row)));
        if (!this.sortBy) return found;
        const { column, ascending } = this.sortBy;
        return [...found].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
    }

    private runInsert(rows: Row[]): FakeResult {
        const payloads = Array.isArray(this.payload) ? (this.payload as Row[]) : [this.payload as Row];
        const inserted: Row[] = [];
        for (const payload of payloads) {
            const row = this.withDefaults(payload);
            this.store.beforeInsert?.(this.table, row);
            const current = this.store.tables[this.table] ?? rows;
            if (this.violatesUnique(current, row)) {
                return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            current.push(row);
            this.store.tables[this.table] = current;
            inserted.push(row);
        }
        return this.returning ? this.shape(inserted) : { data: null, error: null };
    }

    private withDefaults(payload: Row): Row {
        const id = this.table === "webhook_debug" ? this.store.nextId++ : `${this.table}-${this.store.nextId++}`;
        const base: Row = { id, created_at: new Date().toISOString() };
        if (this.table === "webhook_debug") {
            Object.assign(base, {
                classified_direction: null, journal_status: null, outcome: null, auth_result: null,
                processed_at: null, replay_count: 0, last_replay_at: null,
            });
        }
        const defined = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
        return { ...base, ...defined };
    }

    private violatesUnique(rows: Row[], row: Row): boolean {
        if (this.table === "contacts") {
            return row.phone != null && rows.some((other) => other.phone === row.phone);
        }
        if (this.table === "conversations" && this.store.uniqueConversations) {
            return row.contact_id != null && row.integrated_number != null && rows.some((other) =>
                other.contact_id === row.contact_id && other.integrated_number === row.integrated_number);
        }
        return false;
    }

    private project(row: Row): Row {
        const columns = splitColumns(this.columns ?? "*");
        const out: Row = {};
        for (const column of columns) {
            const relation = /^(\w+)\(/.exec(column);
            if (relation) {
                const contacts = this.store.tables.contacts ?? [];
                out[relation[1]] = { ...(contacts.find((contact) => contact.id === row.contact_id) ?? {}) };
            } else if (column === "*") {
                Object.assign(out, row);
            } else {
                out[column] = row[column] ?? null;
            }
        }
        return out;
    }

    private shape(rows: Row[]): FakeResult {
        const projected = rows.map((row) => this.project(row));
        if (this.mode === "many") return { data: projected, error: null };
        if (projected.length > 1 || (this.mode === "single" && projected.length === 0)) {
            return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
        }
        return { data: projected[0] ?? null, error: null };
    }
}

/** A client exposing only from(), like the subset of supabase-js the code under test uses. */
export function fakeClient(store: FakeStore): { from: (table: string) => FakeQuery } {
    return { from: (table: string) => new FakeQuery(store, table) };
}

/** Bound to fakeStore; the value the tests' vi.mock returns as supabaseAdmin. */
export const fakeSupabase = fakeClient(fakeStore);

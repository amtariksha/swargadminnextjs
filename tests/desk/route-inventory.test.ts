import { describe, expect, it } from 'vitest';
import { DESK_WRAPPED } from '@/lib/desk/authz';

const modules = import.meta.glob('../../src/app/api/desk/**/route.ts');
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

interface Expected { file: string; method: string; level: 'agent' | 'manager'; alwaysOn: boolean }

const EXPECTED: Expected[] = [
    { file: 'me/route.ts', method: 'GET', level: 'agent', alwaysOn: true },
    { file: 'health/route.ts', method: 'GET', level: 'agent', alwaysOn: true },
    { file: 'categories/route.ts', method: 'GET', level: 'agent', alwaysOn: true },
    { file: 'categories/route.ts', method: 'PUT', level: 'manager', alwaysOn: true },
    { file: 'settings/route.ts', method: 'GET', level: 'manager', alwaysOn: true },
    { file: 'settings/route.ts', method: 'PUT', level: 'manager', alwaysOn: true },
    { file: 'tickets/route.ts', method: 'GET', level: 'agent', alwaysOn: false },
    { file: 'tickets/route.ts', method: 'POST', level: 'agent', alwaysOn: false },
    { file: 'tickets/[id]/route.ts', method: 'GET', level: 'agent', alwaysOn: false },
    { file: 'tickets/[id]/route.ts', method: 'PATCH', level: 'agent', alwaysOn: false },
    { file: 'tickets/[id]/resolve/route.ts', method: 'POST', level: 'agent', alwaysOn: false },
    { file: 'action-items/route.ts', method: 'GET', level: 'manager', alwaysOn: false },
    { file: 'action-items/route.ts', method: 'POST', level: 'manager', alwaysOn: false },
    { file: 'action-items/route.ts', method: 'PATCH', level: 'manager', alwaysOn: false },
];

const ROUTE_ROOT = '../../src/app/api/desk/';

async function loadAll(): Promise<Map<string, unknown>> {
    const found = new Map<string, unknown>();
    for (const [path, load] of Object.entries(modules)) {
        const exported = (await load()) as Record<string, unknown>;
        for (const method of HTTP_METHODS) {
            if (method in exported) found.set(`${path.slice(ROUTE_ROOT.length)}#${method}`, exported[method]);
        }
    }
    return found;
}

describe('route inventory', () => {
    it('wraps every exported HTTP method in withDesk', async () => {
        const found = await loadAll();
        expect(found.size).toBeGreaterThan(0);
        for (const [key, handler] of found) {
            expect((handler as Record<symbol, unknown>)[DESK_WRAPPED], key).toBeDefined();
        }
    });

    it('has every expected route with its level and alwaysOn marker', async () => {
        const found = await loadAll();
        for (const row of EXPECTED) {
            const handler = found.get(`${row.file}#${row.method}`) as Record<symbol, unknown> | undefined;
            expect(handler, `${row.file} ${row.method}`).toBeDefined();
            expect(handler?.[DESK_WRAPPED]).toEqual({ level: row.level, alwaysOn: row.alwaysOn });
        }
    });
});

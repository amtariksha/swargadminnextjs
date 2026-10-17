import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideDeskGuard } from '@/lib/desk/guard';
import type { DeskEnvelope } from '@/lib/desk/contracts';
import type { DeskMe } from '@/lib/desk/types';

const me = (over: Partial<DeskMe> = {}): DeskEnvelope<DeskMe> => ({
    ok: true,
    data: {
        user: { id: '1', name: 'A' }, agent: true, manager: false, money: true, inbox: true, via: 'permission',
        ui_enabled: true, cutover_redirect: false, ack_suppress: 'shadow', reply_alert_mins: 15,
        credit_max_agent: 200, business_hours: { start: '05:30', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] },
        last_tick_at: null, tick_stale: false, ...over,
    },
});
const fail = (code: Parameters<typeof failEnvelope>[0]): DeskEnvelope<DeskMe> => failEnvelope(code);
function failEnvelope(code: 'forbidden' | 'unauthorized' | 'authz_unavailable' | 'internal_error' | 'not_installed'): DeskEnvelope<DeskMe> {
    return { ok: false, error: { code, message: 'm' } };
}

describe('decideDeskGuard', () => {
    it.each([
        ['D01', me(), '/desk', 'workspace'],
        ['D02', fail('forbidden'), '/desk', 'no_access'],
        ['D03', fail('unauthorized'), '/desk', 'session_expired'],
        ['D04', fail('authz_unavailable'), '/desk', 'unavailable'],
        ['D05', fail('internal_error'), '/desk/tickets', 'unavailable'],
        ['D06', me({ ui_enabled: false }), '/desk', 'switched_off'],
        ['D07', me({ ui_enabled: false, manager: true }), '/desk/settings', 'workspace'],
        ['D08', me({ ui_enabled: false, manager: true }), '/desk', 'switched_off'],
        ['D09', me({ ui_enabled: false }), '/desk/settings', 'switched_off'],
        ['D10', me(), '/desk/dashboard', 'manager_only'],
        ['D11', me({ manager: true }), '/desk/review', 'workspace'],
        ['D12', me(), '/desk/settings/categories', 'manager_only'],
        ['D13', me({ money: false, via: 'delivery_capability' }), '/desk', 'workspace'],
        ['D14', me(), '/desk/tickets', 'workspace'],
        ['D15', fail('not_installed'), '/desk', 'unavailable'],
    ] as const)('%s', (_id, envelope, pathname, view) => {
        expect(decideDeskGuard(envelope, pathname).view).toBe(view);
    });

    it('carries the code on unavailable', () => {
        expect(decideDeskGuard(fail('not_installed'), '/desk')).toEqual({ view: 'unavailable', code: 'not_installed' });
    });
});

describe('desk sources never navigate to /login', () => {
    const files = ['src/app/(main)/(dashboard)/desk/layout.tsx', 'src/lib/desk/client.ts'];
    it.each(files)('%s has no login redirect, router or axios helper', (file) => {
        const text = readFileSync(file, 'utf8');
        expect(text).not.toContain('/login');
        expect(text).not.toContain('useRouter');
        expect(text).not.toContain("@/lib/api'");
    });
});

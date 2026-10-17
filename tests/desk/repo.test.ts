import { describe, it, expect, vi } from 'vitest';
import { classifyDeskDbError, reportNotInstalled, type DeskDbOutcome } from '@/lib/desk/repo';

type ErrorLike = Parameters<typeof classifyDeskDbError>[0];

const CASES: ReadonlyArray<readonly [string, ErrorLike, DeskDbOutcome]> = [
    ['X01 null', null, 'ok'],
    ['X02 undefined', undefined, 'ok'],
    ['X03 unique violation', { code: '23505' }, 'conflict'],
    ['X04 table missing', { code: '42P01' }, 'not_installed'],
    ['X05 column missing', { code: '42703' }, 'not_installed'],
    ['X06 permission denied', { code: '42501' }, 'not_installed'],
    ['X07 PGRST204', { code: 'PGRST204' }, 'not_installed'],
    ['X08 PGRST205', { code: 'PGRST205' }, 'not_installed'],
    ['X09 AbortError name', { name: 'AbortError' }, 'timeout'],
    ['X10 TimeoutError name', { name: 'TimeoutError' }, 'timeout'],
    ['X11 TimeoutError message prefix', { code: '', message: 'TimeoutError: The operation was aborted due to timeout' }, 'timeout'],
    ['X12 AbortError message prefix', { code: '', message: 'AbortError: This operation was aborted' }, 'timeout'],
    ['X13 check violation', { code: '23514' }, 'error'],
    ['X13 not null violation', { code: '23502' }, 'error'],
    ['X13 foreign key violation', { code: '23503' }, 'error'],
    ['X13 internal error', { code: 'XX000' }, 'error'],
    ['X13 fetch failed', { message: 'fetch failed' }, 'error'],
    ['X13 empty object', {}, 'error'],
    ['X14 more than one row', { code: 'PGRST116' }, 'error'],
];

describe('classifyDeskDbError', () => {
    it.each(CASES)('%s', (_label, input, expected) => {
        expect(classifyDeskDbError(input)).toBe(expected);
    });

    it('checks the code before the timeout message', () => {
        expect(classifyDeskDbError({ code: '42501', message: 'TimeoutError: x' })).toBe('not_installed');
    });

    it('does not treat a message that merely contains Timeout as a timeout', () => {
        expect(classifyDeskDbError({ code: '', message: 'upstream request Timeout' })).toBe('error');
    });
});

describe('reportNotInstalled', () => {
    it('logs once per table and code', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        reportNotInstalled('x_test_table', '42P01');
        reportNotInstalled('x_test_table', '42P01');
        reportNotInstalled('x_test_table', '42P01');
        expect(warn).toHaveBeenCalledTimes(1);
        reportNotInstalled('x_test_table', 'PGRST205');
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});

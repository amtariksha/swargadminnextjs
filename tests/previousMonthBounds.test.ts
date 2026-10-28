import { describe, expect, it } from 'vitest';
import { previousMonthBounds } from '@/lib/accounting';

describe('previousMonthBounds', () => {
    it('the whole month before, inclusive', () => {
        expect(previousMonthBounds(new Date(2026, 9, 28))).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    });

    it('January → the previous December', () => {
        expect(previousMonthBounds(new Date(2026, 0, 1))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    });

    it('February in leap and plain years', () => {
        expect(previousMonthBounds(new Date(2024, 2, 5))).toEqual({ from: '2024-02-01', to: '2024-02-29' });
        expect(previousMonthBounds(new Date(2025, 2, 31))).toEqual({ from: '2025-02-01', to: '2025-02-28' });
    });
});

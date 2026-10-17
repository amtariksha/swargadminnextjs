'use client';

import type { DeskCategories } from '@/lib/desk/ticket-hooks';
import { categoryLabel } from '@/lib/desk/ticket-format';
import type { Ticket } from '@/lib/desk/types';

interface CategoryChipsProps {
    ticket: Pick<Ticket, 'category_slug' | 'suggested_category'>;
    categories: DeskCategories;
    disabled: boolean;
    onClassify: (slug: string) => void;
    onOpenPicker: () => void;
}

const SOLID = 'rounded-lg bg-purple-500/20 px-2.5 py-1 text-xs text-purple-300 hover:bg-purple-500/30 disabled:opacity-50';
const DASHED = 'rounded-lg border border-dashed border-slate-500 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800/50 disabled:opacity-50';

/** The current category, the engine's suggestion, or a way to choose. Classifying is one click (decision D-d). */
export function CategoryChips({ ticket, categories, disabled, onClassify, onOpenPicker }: CategoryChipsProps) {
    const { category_slug: slug, suggested_category: suggested } = ticket;
    if (slug !== null) {
        return (
            <button type="button" disabled={disabled} onClick={onOpenPicker} className={SOLID}>
                {categoryLabel(slug, categories.bySlug)}
            </button>
        );
    }
    if (categories.items.length === 0) {
        return <span className="text-xs text-slate-500">No categories configured</span>;
    }
    const activeSuggestion = suggested !== null && categories.bySlug.get(suggested)?.active === true ? suggested : null;
    if (activeSuggestion === null) {
        return <button type="button" disabled={disabled} onClick={onOpenPicker} className={DASHED}>Choose category…</button>;
    }
    return (
        <div className="flex gap-2">
            <button type="button" disabled={disabled} onClick={() => onClassify(activeSuggestion)} className={DASHED}>
                Suggested: {categoryLabel(activeSuggestion, categories.bySlug)}
            </button>
            <button type="button" disabled={disabled} onClick={onOpenPicker} className={DASHED}>Other…</button>
        </div>
    );
}

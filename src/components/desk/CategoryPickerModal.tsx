'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { inputClassName } from '@/components/FormField';
import { groupCategoriesByType } from '@/lib/desk/ticket-format';
import { TICKET_TYPE_LABEL } from '@/lib/desk/ticket-labels';
import type { Category } from '@/lib/desk/types';

interface CategoryPickerModalProps {
    categories: readonly Category[];
    currentSlug: string | null;
    onPick: (slug: string) => void;
    onClose: () => void;
}

/** Active categories grouped by type, with a text filter over the label. */
export function CategoryPickerModal({ categories, currentSlug, onPick, onClose }: CategoryPickerModalProps) {
    const [filter, setFilter] = useState('');
    const needle = filter.trim().toLowerCase();
    const visible = categories.filter((category) => category.label.toLowerCase().includes(needle));
    return (
        <Modal isOpen onClose={onClose} title="Choose category" size="lg">
            <input
                autoFocus
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter categories"
                className={inputClassName}
            />
            <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto">
                {groupCategoriesByType(visible).map((group) => (
                    <div key={group.type}>
                        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                            {TICKET_TYPE_LABEL[group.type]}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {group.items.map((category) => (
                                <button
                                    key={category.slug}
                                    type="button"
                                    onClick={() => onPick(category.slug)}
                                    className={`rounded-lg px-2.5 py-1 text-sm ${
                                        category.slug === currentSlug
                                            ? 'bg-purple-500/30 text-purple-200'
                                            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                                    }`}
                                >
                                    {category.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
                {visible.length === 0 ? <p className="text-sm text-slate-500">No category matches.</p> : null}
            </div>
        </Modal>
    );
}

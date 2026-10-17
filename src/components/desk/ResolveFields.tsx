'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { selectClassName, textareaClassName, inputClassName } from '@/components/FormField';
import { HUMAN_RESOLUTION_CODES, LOST_REASONS, type HumanResolutionCode } from '@/lib/desk/constants';
import { isHumanCode, type ResolveDraft } from '@/lib/desk/resolve-plan';
import { categoryLabel, groupCategoriesByType } from '@/lib/desk/ticket-format';
import { ticketByNoOptions } from '@/lib/desk/ticket-hooks';
import {
    LOST_REASON_LABEL, RESOLUTION_CODE_LABEL, TICKET_TYPE_LABEL, USUAL_CODES_BY_TYPE, deskErrorText,
} from '@/lib/desk/ticket-labels';
import type { Category, Ticket } from '@/lib/desk/types';

interface ResolveFieldsProps {
    mode: 'resolve' | 'wrap_up';
    ticket: Pick<Ticket, 'ticket_no' | 'link_status'>;
    categories: readonly Category[];
    bySlug: ReadonlyMap<string, Category>;
    draft: ResolveDraft;
    noteRequired: boolean;
    onChange: (patch: Partial<ResolveDraft>) => void;
}

const LABEL = 'mb-1 block text-xs font-medium text-slate-400';

function codeOptions(codes: readonly HumanResolutionCode[]) {
    return codes.map((code) => <option key={code} value={code}>{RESOLUTION_CODE_LABEL[code]}</option>);
}

function DuplicateField({ ticketNo, bySlug, onChange }: Pick<ResolveFieldsProps, 'bySlug' | 'onChange'> & { ticketNo: number }) {
    const queryClient = useQueryClient();
    const [text, setText] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const check = async () => {
        const target = Number(text);
        if (!Number.isInteger(target) || target <= 0) return setResult('Enter a ticket number.');
        if (target === ticketNo) return setResult(deskErrorText('duplicate_target_required', ''));
        try {
            const found = await queryClient.fetchQuery(ticketByNoOptions(target));
            if (found === null) return setResult(`Ticket #${target} was not found.`);
            onChange({
                duplicate_of_ticket_no: target,
                ...(found.category_slug !== null ? { category_slug: found.category_slug, classification_source: 'human' as const } : {}),
            });
            setResult(`#${target} · ${found.customer_name ?? found.customer_phone ?? 'Unknown'} · ${categoryLabel(found.category_slug, bySlug)}`);
        } catch (error: unknown) {
            setResult(error instanceof Error ? error.message : 'Could not check that ticket.');
        }
    };
    return (
        <div>
            <label className={LABEL}>Duplicate of #</label>
            <div className="flex gap-2">
                <input
                    inputMode="numeric"
                    value={text}
                    onChange={(e) => { setText(e.target.value); setResult(null); onChange({ duplicate_of_ticket_no: null }); }}
                    className={inputClassName}
                />
                <button type="button" onClick={() => { void check(); }} className="rounded-lg bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-700">Check</button>
            </div>
            {result !== null ? <p className="mt-1 text-xs text-slate-400">{result}</p> : null}
        </div>
    );
}

export function ResolveFields({ mode, ticket, categories, bySlug, draft, noteRequired, onChange }: ResolveFieldsProps) {
    const category = draft.category_slug === null ? null : bySlug.get(draft.category_slug) ?? null;
    const usual = category === null ? [] : USUAL_CODES_BY_TYPE[category.type];
    const selectable = HUMAN_RESOLUTION_CODES.filter((code) => mode === 'resolve' || code !== 'duplicate');
    const others = selectable.filter((code) => !usual.includes(code));
    const pickCategory = (slug: string) => {
        const next = bySlug.get(slug);
        const defaultCode = next?.default_resolution_code ?? null;
        const keepCode = mode === 'wrap_up' && draft.resolution_code !== null;
        onChange({
            category_slug: slug,
            classification_source: 'human',
            ...(keepCode ? {} : { resolution_code: isHumanCode(defaultCode) ? defaultCode : null }),
        });
    };
    return (
        <div className="space-y-3">
            <div>
                <label className={LABEL}>Category</label>
                <select value={draft.category_slug ?? ''} onChange={(e) => pickCategory(e.target.value)} className={selectClassName}>
                    <option value="" disabled>Choose…</option>
                    {groupCategoriesByType(categories).map((group) => (
                        <optgroup key={group.type} label={TICKET_TYPE_LABEL[group.type]}>
                            {group.items.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
                        </optgroup>
                    ))}
                </select>
            </div>
            <div>
                <label className={LABEL}>Resolution</label>
                <select
                    value={draft.resolution_code ?? ''}
                    onChange={(e) => onChange({ resolution_code: isHumanCode(e.target.value) ? e.target.value : null })}
                    className={selectClassName}
                >
                    <option value="" disabled>Choose…</option>
                    {usual.length > 0 ? <optgroup label="Usual">{codeOptions(usual.filter((code) => selectable.includes(code)))}</optgroup> : null}
                    <optgroup label={usual.length > 0 ? 'Other' : 'All'}>{codeOptions(others)}</optgroup>
                </select>
            </div>
            {draft.resolution_code === 'lost' ? (
                <div>
                    <label className={LABEL}>Lost reason</label>
                    <select
                        value={draft.lost_reason ?? ''}
                        onChange={(e) => onChange({ lost_reason: LOST_REASONS.find((reason) => reason === e.target.value) ?? null })}
                        className={selectClassName}
                    >
                        <option value="" disabled>Choose…</option>
                        {LOST_REASONS.map((reason) => <option key={reason} value={reason}>{LOST_REASON_LABEL[reason]}</option>)}
                    </select>
                </div>
            ) : null}
            {draft.resolution_code === 'duplicate' && mode === 'resolve' ? (
                <DuplicateField ticketNo={ticket.ticket_no} bySlug={bySlug} onChange={onChange} />
            ) : null}
            <div>
                <label className={LABEL}>Note{noteRequired ? ' (required)' : ''}</label>
                <textarea
                    value={draft.resolution_note}
                    maxLength={1000}
                    onChange={(e) => onChange({ resolution_note: e.target.value })}
                    className={textareaClassName}
                />
            </div>
            {mode === 'resolve' && category?.requires_delivery_link === true && ticket.link_status === null ? (
                <fieldset className="space-y-1 text-sm text-slate-200">
                    <legend className={LABEL}>Delivery</legend>
                    {([['none_found', 'No matching delivery'], ['not_a_customer', 'Not a customer']] as const).map(([value, text]) => (
                        <label key={value} className="mr-4 inline-flex items-center gap-1.5">
                            <input type="radio" name="delivery-link" checked={draft.link_status === value} onChange={() => onChange({ link_status: value })} />
                            {text}
                        </label>
                    ))}
                    <p className="text-xs text-slate-500">Linking a delivery arrives with the customer pane.</p>
                </fieldset>
            ) : null}
        </div>
    );
}

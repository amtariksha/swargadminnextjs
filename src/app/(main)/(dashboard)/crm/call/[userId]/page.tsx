'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { format } from 'date-fns';
import {
    ArrowLeft, ChevronDown, ChevronRight, Phone, Wallet, MapPin, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    useCustomerContext, useCallScript, useFeedbackEntry,
    useCreateFeedback, useUpdateFeedback,
} from '@/hooks/useData';
import { inputClassName, selectClassName, textareaClassName } from '@/components/FormField';
import {
    FEEDBACK_STATUS_OPTIONS, RING_BELL_OPTIONS, DROP_PLACE_OPTIONS, CALL_TYPE_OPTIONS,
} from '@/lib/crm';
import MarkdownView from '@/components/crm/MarkdownView';
import ActivityWindowStrip from '@/components/crm/ActivityWindowStrip';

type CallType = 'feedback' | 'reactivation';

const EMPTY_FORM = {
    calling_date: '',
    problems: '',
    product_feedback: '',
    delivery_feedback: '',
    preferred_call_time: '',
    preferred_delivery_time: '',
    ring_bell_pref: '',
    drop_place_pref: '',
    application_feedback: '',
    customer_care_notes: '',
    occupation: '',
    status: '',
    followup_date: '',
};

/** A numbered checklist section card for the "During the call" form. */
function Section({
    n, title, hint, children,
}: {
    n: number;
    title: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3 mb-1">
                <div className="w-7 h-7 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {n}
                </div>
                <h3 className="text-base font-semibold text-white">{title}</h3>
            </div>
            {hint && <p className="text-sm text-slate-400 mb-3 ml-10">{hint}</p>}
            <div className="ml-10">{children}</div>
        </div>
    );
}

export default function GuidedCallPage() {
    const { userId } = useParams<{ userId: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();

    const feedbackId = searchParams.get('feedbackId');
    const fromWorklist = searchParams.get('from') === 'worklist';
    const isEdit = !!feedbackId;

    const [callType, setCallType] = useState<CallType>(
        searchParams.get('type') === 'reactivation' ? 'reactivation' : 'feedback',
    );
    // When editing an existing feedback the script panel is collapsed by
    // default — the caller has already read it once; on new entries we
    // surface it open so they don't miss the prompt.
    const [scriptOpen, setScriptOpen] = useState(!isEdit);
    const [form, setForm] = useState({ ...EMPTY_FORM, calling_date: format(new Date(), 'yyyy-MM-dd') });
    const [prefilled, setPrefilled] = useState(false);

    const { data: ctx, isLoading: ctxLoading, isError: ctxError } = useCustomerContext(userId);
    const script = useCallScript(callType);
    const { data: entry } = useFeedbackEntry(feedbackId ?? undefined, isEdit);
    const createMutation = useCreateFeedback();
    const updateMutation = useUpdateFeedback();

    // Prefill once when editing — set during render (guarded so it converges),
    // which is the React-sanctioned pattern for seeding state from loaded data.
    if (entry && !prefilled) {
        setForm({
            calling_date: entry.calling_date ? String(entry.calling_date).slice(0, 10) : '',
            problems: entry.problems ?? '',
            product_feedback: entry.product_feedback ?? '',
            delivery_feedback: entry.delivery_feedback ?? '',
            preferred_call_time: entry.preferred_call_time ?? '',
            preferred_delivery_time: entry.preferred_delivery_time ?? '',
            ring_bell_pref: entry.ring_bell_pref ?? '',
            drop_place_pref: entry.drop_place_pref ?? '',
            application_feedback: entry.application_feedback ?? '',
            customer_care_notes: entry.customer_care_notes ?? '',
            occupation: entry.occupation ?? '',
            status: entry.status ?? '',
            followup_date: entry.followup_date ? String(entry.followup_date).slice(0, 10) : '',
        });
        if (entry.call_type === 'reactivation' || entry.call_type === 'feedback') {
            setCallType(entry.call_type);
        }
        setPrefilled(true);
    }

    const setField = (key: keyof typeof EMPTY_FORM, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const isSaving = createMutation.isPending || updateMutation.isPending;

    const handleSave = async () => {
        if (!form.status) {
            toast.error('Please choose a call outcome (status) before saving.');
            return;
        }
        if (form.status === 'call_later' && !form.followup_date) {
            toast.error('Please set a follow-up date for a "Call Later" outcome.');
            return;
        }

        const payload = {
            call_type: callType,
            calling_date: form.calling_date || null,
            status: form.status,
            followup_date: form.status === 'call_later' ? form.followup_date || null : null,
            occupation: form.occupation,
            preferred_call_time: form.preferred_call_time,
            problems: form.problems,
            product_feedback: form.product_feedback,
            delivery_feedback: form.delivery_feedback,
            preferred_delivery_time: form.preferred_delivery_time,
            ring_bell_pref: form.ring_bell_pref,
            drop_place_pref: form.drop_place_pref,
            application_feedback: form.application_feedback,
            customer_care_notes: form.customer_care_notes,
        };

        try {
            if (isEdit) {
                await updateMutation.mutateAsync({ id: feedbackId as string, ...payload });
                toast.success('Feedback updated');
            } else {
                await createMutation.mutateAsync({ user_id: Number(userId), ...payload });
                toast.success('Feedback saved');
            }
            router.push(fromWorklist ? '/crm/worklist' : `/users/${userId}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save feedback');
        }
    };

    if (ctxLoading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-40 bg-slate-800/50 rounded animate-pulse" />
                <div className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />
            </div>
        );
    }
    if (ctxError || !ctx) {
        return (
            <div className="text-center py-20">
                <p className="text-slate-400">Customer not found.</p>
                <button onClick={() => router.back()} className="mt-4 text-purple-400">Go back</button>
            </div>
        );
    }

    return (
        <div className="space-y-5 max-w-3xl mx-auto pb-24">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-slate-800/50 rounded-lg"
                    aria-label="Go back"
                >
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white">{ctx.name}</h1>
                    <p className="text-slate-400 text-sm">{isEdit ? 'Editing a logged call' : 'Logging a call'}</p>
                </div>
            </div>

            {/* Customer context card */}
            <div className="glass rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="flex items-center gap-2 text-slate-300">
                        <Phone className="w-4 h-4 text-slate-500" />
                        <a href={`tel:${ctx.phone}`} className="font-semibold text-lg text-white hover:text-purple-300">
                            {ctx.phone || '-'}
                        </a>
                    </span>
                    <span className="flex items-center gap-2">
                        <Wallet className={`w-4 h-4 ${Number(ctx.wallet_amount) < 250 ? 'text-red-400' : 'text-green-400'}`} />
                        <span className={Number(ctx.wallet_amount) < 250 ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                            ₹{ctx.wallet_amount ?? 0}
                        </span>
                    </span>
                    <span className="flex items-center gap-2 text-slate-300">
                        <MapPin className="w-4 h-4 text-slate-500" />
                        {ctx.route || 'No route'}
                    </span>
                </div>
                <ActivityWindowStrip
                    windows={ctx.activity_windows}
                    daysSinceLastDelivery={ctx.days_since_last_delivery}
                />
            </div>

            {/* "Before the call" — the script */}
            <div className="glass rounded-xl overflow-hidden">
                <button
                    onClick={() => setScriptOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/30"
                >
                    <span className="text-base font-semibold text-white">📞 Before the call — read the script</span>
                    {scriptOpen ? (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                    ) : (
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                    )}
                </button>
                {scriptOpen && (
                    <div className="px-5 pb-5 space-y-3">
                        {/* Call-type toggle */}
                        <div className="flex gap-2">
                            {CALL_TYPE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setCallType(opt.value as CallType)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        callType === opt.value
                                            ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                                            : 'bg-slate-800/50 text-slate-400 border border-transparent hover:text-white'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 border border-slate-800/60 p-4">
                            {script.isLoading && <p className="text-sm text-slate-400">Loading script…</p>}
                            {script.isError && (
                                <p className="text-sm text-slate-400">
                                    No script configured for this call type. A manager can add one under
                                    {' '}<span className="text-purple-300">CRM → Call Scripts</span>.
                                </p>
                            )}
                            {script.data && <MarkdownView content={script.data.body} />}
                        </div>
                    </div>
                )}
            </div>

            {/* "During the call" — the checklist form */}
            <div>
                <h2 className="text-lg font-semibold text-white mb-3">✅ During the call</h2>
                <div className="space-y-4">
                    <Section
                        n={1}
                        title="Greeting"
                        hint="Greet the customer and introduce yourself, as in the script above."
                    >
                        <p className="text-xs text-slate-500">No notes needed for this step.</p>
                    </Section>

                    <Section n={2} title="Problems / issues" hint="Any complaints or issues the customer raised.">
                        <textarea
                            value={form.problems}
                            onChange={(e) => setField('problems', e.target.value)}
                            rows={3}
                            className={textareaClassName}
                            placeholder="What problems did the customer mention?"
                        />
                    </Section>

                    <Section n={3} title="Product feedback" hint="What the customer said about the products.">
                        <textarea
                            value={form.product_feedback}
                            onChange={(e) => setField('product_feedback', e.target.value)}
                            rows={3}
                            className={textareaClassName}
                            placeholder="Product quality, quantity, favourites…"
                        />
                    </Section>

                    <Section n={4} title="Delivery feedback" hint="What the customer said about delivery.">
                        <textarea
                            value={form.delivery_feedback}
                            onChange={(e) => setField('delivery_feedback', e.target.value)}
                            rows={3}
                            className={textareaClassName}
                            placeholder="Delivery timing, the delivery boy, packaging…"
                        />
                    </Section>

                    <Section n={5} title="Preferences" hint="Capture how the customer wants to be served.">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-300 mb-1.5">Preferred call time</label>
                                <input
                                    value={form.preferred_call_time}
                                    onChange={(e) => setField('preferred_call_time', e.target.value)}
                                    className={inputClassName}
                                    placeholder="e.g. after 6 pm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-1.5">Preferred delivery time</label>
                                <input
                                    value={form.preferred_delivery_time}
                                    onChange={(e) => setField('preferred_delivery_time', e.target.value)}
                                    className={inputClassName}
                                    placeholder="e.g. 6:30 am"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-1.5">Ring bell / intimation</label>
                                <select
                                    value={form.ring_bell_pref}
                                    onChange={(e) => setField('ring_bell_pref', e.target.value)}
                                    className={selectClassName}
                                >
                                    <option value="">Not specified</option>
                                    {RING_BELL_OPTIONS.map((o) => (
                                        <option key={o} value={o}>{o}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-1.5">Drop place</label>
                                <select
                                    value={form.drop_place_pref}
                                    onChange={(e) => setField('drop_place_pref', e.target.value)}
                                    className={selectClassName}
                                >
                                    <option value="">Not specified</option>
                                    {DROP_PLACE_OPTIONS.map((o) => (
                                        <option key={o} value={o}>{o}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </Section>

                    <Section n={6} title="App feedback" hint="What the customer said about the mobile app.">
                        <textarea
                            value={form.application_feedback}
                            onChange={(e) => setField('application_feedback', e.target.value)}
                            rows={2}
                            className={textareaClassName}
                            placeholder="Ease of use, any bugs…"
                        />
                    </Section>

                    <Section n={7} title="Customer care notes" hint="Anything else worth recording.">
                        <textarea
                            value={form.customer_care_notes}
                            onChange={(e) => setField('customer_care_notes', e.target.value)}
                            rows={2}
                            className={textareaClassName}
                            placeholder="Ratings, upsell response, other notes…"
                        />
                    </Section>

                    <Section n={8} title="Occupation" hint="The customer's occupation, if mentioned.">
                        <input
                            value={form.occupation}
                            onChange={(e) => setField('occupation', e.target.value)}
                            className={inputClassName}
                            placeholder="e.g. teacher, software engineer"
                        />
                    </Section>

                    <Section n={9} title="Call outcome" hint="How did the call end?">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-300 mb-1.5">
                                    Status <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={form.status}
                                    onChange={(e) => setField('status', e.target.value)}
                                    className={selectClassName}
                                >
                                    <option value="">Choose an outcome…</option>
                                    {FEEDBACK_STATUS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-1.5">Call date</label>
                                <input
                                    type="date"
                                    value={form.calling_date}
                                    onChange={(e) => setField('calling_date', e.target.value)}
                                    className={inputClassName}
                                />
                            </div>
                            {form.status === 'call_later' && (
                                <div>
                                    <label className="block text-sm text-slate-300 mb-1.5">
                                        Follow-up date <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={form.followup_date}
                                        onChange={(e) => setField('followup_date', e.target.value)}
                                        className={inputClassName}
                                    />
                                </div>
                            )}
                        </div>
                    </Section>
                </div>
            </div>

            {/* Sticky save bar */}
            <div className="fixed bottom-0 left-0 right-0 lg:left-72 bg-slate-900/95 backdrop-blur border-t border-slate-800/50 px-4 py-3 flex justify-end gap-3 z-30">
                <button
                    onClick={() => router.back()}
                    className="px-5 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl hover:bg-slate-700/50"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Saving…' : isEdit ? 'Update call' : 'Save call'}
                </button>
            </div>
        </div>
    );
}

'use client';

import { useState, useMemo } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { useCallScripts, useUpdateCallScript } from '@/hooks/useData';
import { inputClassName } from '@/components/FormField';
import MarkdownView from '@/components/crm/MarkdownView';

const SCRIPT_TYPE_LABELS: Record<string, string> = {
    feedback: 'Feedback Script',
    reactivation: 'Reactivation Script',
};

export default function CallScriptsPage() {
    const { data: scripts = [], isLoading } = useCallScripts();
    const updateMutation = useUpdateCallScript();

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [draftId, setDraftId] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');

    const selected = useMemo(
        () => scripts.find((s) => s.id === selectedId) ?? scripts[0],
        [scripts, selectedId],
    );

    // Load the selected script into the editable draft when the selection
    // changes — set during render (guarded so it converges).
    if (selected && draftId !== selected.id) {
        setDraftId(selected.id);
        setTitle(selected.title);
        setBody(selected.body);
    }

    const isDirty = !!selected && (title !== selected.title || body !== selected.body);

    const handleSave = async () => {
        if (!selected) return;
        if (!title.trim() || !body.trim()) {
            toast.error('Title and body cannot be empty.');
            return;
        }
        try {
            await updateMutation.mutateAsync({ id: selected.id, title: title.trim(), body });
            toast.success('Script saved');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save script');
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-44 bg-slate-800/50 rounded animate-pulse" />
                <div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (scripts.length === 0) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold text-white">Call scripts</h1>
                <div className="glass rounded-xl p-8 text-center text-slate-400">
                    No call scripts found. Run the historic import (<code className="text-purple-300">scripts/import-feedback.js</code>)
                    to seed the feedback and reactivation scripts.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Call scripts</h1>
                    <p className="text-slate-400 text-sm">
                        Edit the scripts callers read on the guided call screen. Body is markdown.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={!isDirty || updateMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {updateMutation.isPending ? 'Saving…' : 'Save script'}
                </button>
            </div>

            {/* Script selector */}
            <div className="flex gap-2">
                {scripts.map((s) => (
                    <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            selected?.id === s.id
                                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                                : 'bg-slate-800/50 text-slate-400 border border-transparent hover:text-white'
                        }`}
                    >
                        {SCRIPT_TYPE_LABELS[s.script_type] || s.script_type}
                    </button>
                ))}
            </div>

            {/* Editor + live preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="glass rounded-xl p-5 space-y-3">
                    <div>
                        <label className="block text-sm text-slate-300 mb-1.5">Title</label>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1.5">Body (markdown)</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={26}
                            spellCheck={false}
                            className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm font-mono resize-y"
                        />
                    </div>
                </div>
                <div className="glass rounded-xl p-5">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Live preview</p>
                    <div className="rounded-lg bg-slate-900/60 border border-slate-800/60 p-4">
                        <MarkdownView content={body} />
                    </div>
                </div>
            </div>
        </div>
    );
}

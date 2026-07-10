'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { POST, ApiError } from '@/lib/api';
import { getTemplates } from '@/lib/whatsapp/api';
import type { Template } from '@/lib/whatsapp/types';

/**
 * Variable extraction for the WhatsApp composer. The shared
 * parseTemplateVariables (lib/whatsapp/utils) only matches numeric {{1}}
 * placeholders; approved templates here can also use NAMED params
 * ({{name}}, {{orderno}}), so match any word token.
 */
export const extractTemplateVariables = (text: string): string[] => {
    const vars: string[] = [];
    const re = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        if (!vars.includes(match[1])) vars.push(match[1]);
    }
    return vars;
};

export const templateBodyText = (template: Template | null): string =>
    template?.components.find((c) => c.type?.toUpperCase() === 'BODY')?.text ?? '';

export const templateHasImageHeader = (template: Template | null): boolean =>
    Boolean(
        template?.components.some(
            (c) => c.type?.toUpperCase() === 'HEADER' && c.format?.toUpperCase() === 'IMAGE',
        ),
    );

/** Body text with filled variables substituted; unfilled ones stay visible as {{var}}. */
export const renderTemplatePreview = (
    text: string,
    params: Record<string, string>,
): string =>
    text.replace(/\{\{(\w+)\}\}/g, (whole, v: string) =>
        params[v] && params[v].trim() ? params[v] : whole,
    );

interface WhatsAppTemplateSelectorProps {
    template: Template | null;
    onTemplateChange: (template: Template | null) => void;
    params: Record<string, string>;
    onParamsChange: (next: Record<string, string>) => void;
    headerImageUrl: string;
    onHeaderImageUrlChange: (url: string) => void;
}

/**
 * The composer's Content section in WhatsApp mode. Business-initiated
 * WhatsApp messages MUST use a pre-approved template, so instead of the
 * free-text title/body this renders: an approved-template picker (live
 * MSG91 list via the admin's own /api/whatsapp/templates), one input per
 * {{variable}}, an optional header image (for IMAGE-header templates),
 * and a live preview of the rendered message.
 */
export default function WhatsAppTemplateSelector({
    template,
    onTemplateChange,
    params,
    onParamsChange,
    headerImageUrl,
    onHeaderImageUrlChange,
}: WhatsAppTemplateSelectorProps) {
    const [uploading, setUploading] = useState(false);

    const { data: templates = [], isLoading, isError } = useQuery({
        queryKey: ['wa-approved-templates'],
        queryFn: getTemplates,
        select: (rows: Template[]) =>
            rows.filter((t) => String(t.status).toLowerCase() === 'approved'),
        staleTime: 60_000,
    });

    const bodyText = templateBodyText(template);
    const variables = useMemo(() => extractTemplateVariables(bodyText), [bodyText]);
    const needsHeaderImage = templateHasImageHeader(template);
    const preview = useMemo(
        () => renderTemplatePreview(bodyText, params),
        [bodyText, params],
    );

    const handlePick = (name: string) => {
        const next = templates.find((t) => t.name === name) ?? null;
        onTemplateChange(next);
        onParamsChange({});
        onHeaderImageUrlChange('');
    };

    const handleUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Pick an image file');
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await POST<{ image_url: string }>('/broadcast/upload_image', fd);
            if (res.data?.image_url) onHeaderImageUrlChange(res.data.image_url);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Image upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-white font-semibold">
                <MessageCircle className="w-5 h-5 text-emerald-400" />
                WhatsApp template
            </div>
            <p className="text-xs text-slate-400 -mt-3">
                WhatsApp business messages must use a pre-approved template — pick
                one and fill its variables. Manage templates under WhatsApp ▸ Templates.
            </p>

            {isError ? (
                <p className="text-sm text-red-400">
                    Couldn&apos;t load the approved-template list — check WhatsApp settings.
                </p>
            ) : (
                <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Template</label>
                    <select
                        value={template?.name ?? ''}
                        onChange={(e) => handlePick(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    >
                        <option value="">
                            {isLoading ? 'Loading approved templates…' : 'Pick an approved template…'}
                        </option>
                        {templates.map((t) => (
                            <option key={t.id} value={t.name}>
                                {t.name} ({t.language})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {template && variables.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm text-slate-300">Template variables</p>
                    {variables.map((v) => (
                        <div key={v}>
                            <label className="block text-xs text-slate-400 mb-1">
                                {'{{'}{v}{'}}'}
                            </label>
                            <input
                                type="text"
                                value={params[v] ?? ''}
                                onChange={(e) => onParamsChange({ ...params, [v]: e.target.value })}
                                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                            />
                        </div>
                    ))}
                </div>
            )}

            {template && needsHeaderImage && (
                <div>
                    <label className="block text-sm text-slate-300 mb-1.5">
                        Header image <span className="text-slate-500">(this template has an image header)</span>
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={headerImageUrl}
                            onChange={(e) => onHeaderImageUrlChange(e.target.value)}
                            placeholder="https://… public image URL"
                            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                        <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-300 text-sm cursor-pointer hover:bg-slate-800">
                            {uploading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <ImagePlus className="w-4 h-4" />
                            )}
                            Upload
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploading}
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleUpload(f);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    </div>
                    {headerImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={headerImageUrl}
                            alt="Header preview"
                            className="mt-2 max-h-32 rounded-lg border border-slate-700/50"
                        />
                    )}
                </div>
            )}

            {template && (
                <div>
                    <p className="text-sm text-slate-300 mb-1.5">Preview</p>
                    <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap">
                        {preview || <span className="text-slate-500">This template has no body text.</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

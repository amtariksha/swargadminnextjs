'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Save, FileText } from 'lucide-react';
import { GET, POST } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RichTextEditor from '@/components/RichTextEditor';
import { toast } from 'sonner';

// Backend uses numeric page_id (from Laravel):
// 1=About Us, 2=Privacy Policy, 3=Terms, 4=Refund Policy, 5=FAQ
const PAGE_CONFIG: Record<string, { title: string; pageId: number }> = {
    about: { title: 'About Us', pageId: 1 },
    privacy: { title: 'Privacy Policy', pageId: 2 },
    terms: { title: 'Terms & Conditions', pageId: 3 },
    refund: { title: 'Refund Policy', pageId: 4 },
    faq: { title: 'FAQ', pageId: 5 },
};

export default function PageEditorPage() {
    const params = useParams<{ slug: string }>();
    const slug = params.slug || '';
    const queryClient = useQueryClient();
    const [content, setContent] = useState('');
    const [initialized, setInitialized] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const config = PAGE_CONFIG[slug] || { title: 'Page', pageId: 0 };

    const { data: page, isLoading } = useQuery({
        queryKey: ['web-page', config.pageId],
        queryFn: async () => {
            const response = await GET<{ id: number; page_id: number; title: string; body: string }>(`/get_web_page/page/${config.pageId}`);
            return response.data;
        },
        enabled: config.pageId > 0,
    });

    useEffect(() => {
        if (page && !initialized) {
            setContent(page.body || '');
            setInitialized(true);
        }
    }, [page, initialized]);

    // Reset when slug changes
    useEffect(() => {
        setInitialized(false);
    }, [slug]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await POST('/update_web_page', { page_id: config.pageId, body: content });
            queryClient.invalidateQueries({ queryKey: ['web-page', config.pageId] });
            toast.success('Page saved successfully');
        } catch {
            toast.error('Failed to save page');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-slate-800/50 rounded animate-pulse" />
                <div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">{config.title}</h1>
                        <p className="text-slate-400">Edit page content</p>
                    </div>
                </div>
                {/* Page navigation tabs */}
                <div className="flex gap-2 flex-wrap">
                    {Object.entries(PAGE_CONFIG).map(([key, val]) => (
                        <a key={key} href={`/pages/${key}`}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${key === slug ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
                            {val.title}
                        </a>
                    ))}
                </div>
            </div>

            <div className="glass rounded-2xl p-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Content</label>
                <RichTextEditor content={content} onChange={setContent} />
            </div>

            <button onClick={handleSave} disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                <Save className="w-5 h-5" /> {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    );
}

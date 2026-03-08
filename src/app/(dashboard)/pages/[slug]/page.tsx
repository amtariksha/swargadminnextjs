'use client';

import { useState, useEffect } from 'react';
import { Save, FileText } from 'lucide-react';
import { useWebPage, useUpdateWebPage } from '@/hooks/useData';
import RichTextEditor from '@/components/RichTextEditor';
import { toast } from 'sonner';

const pageConfig: Record<string, { title: string; key: string }> = {
    about: { title: 'About Us', key: 'about_us' },
    privacy: { title: 'Privacy Policy', key: 'privacy_policy' },
    terms: { title: 'Terms & Conditions', key: 'terms_conditions' },
    refund: { title: 'Refund Policy', key: 'refund_policy' },
    faq: { title: 'FAQ', key: 'faq' },
};

export default function PageEditorPage({ params }: { params: Promise<{ slug: string }> }) {
    const [slug, setSlug] = useState('');
    const [content, setContent] = useState('');
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        params.then(p => setSlug(p.slug));
    }, [params]);

    const config = pageConfig[slug] || { title: 'Page', key: slug };
    const { data: page, isLoading } = useWebPage(config.key);
    const updatePage = useUpdateWebPage();

    useEffect(() => {
        if (page && !initialized) {
            setContent(page.content || '');
            setInitialized(true);
        }
    }, [page, initialized]);

    const handleSave = async () => {
        try {
            await updatePage.mutateAsync({ page: config.key, content });
            toast.success('Page saved successfully');
        } catch {
            toast.error('Failed to save page');
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
                <button
                    onClick={handleSave}
                    disabled={updatePage.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                >
                    <Save className="w-5 h-5" />
                    {updatePage.isPending ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            <div className="glass rounded-2xl p-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Content</label>
                <RichTextEditor content={content} onChange={setContent} />
            </div>
        </div>
    );
}

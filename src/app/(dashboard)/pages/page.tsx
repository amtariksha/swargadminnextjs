'use client';

import { FileText, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const pages = [
    { name: 'About Us', slug: 'about', description: 'Company information and story' },
    { name: 'Privacy Policy', slug: 'privacy', description: 'Data privacy and protection policy' },
    { name: 'Terms & Conditions', slug: 'terms', description: 'Terms of service' },
    { name: 'Refund Policy', slug: 'refund', description: 'Refund and cancellation policy' },
    { name: 'FAQ', slug: 'faq', description: 'Frequently asked questions' },
];

export default function PagesPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Pages</h1>
                <p className="text-slate-400">Manage static content pages</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pages.map((page) => (
                    <Link
                        key={page.slug}
                        href={`/pages/${page.slug}`}
                        className="glass rounded-xl p-6 hover:bg-slate-800/50 transition-colors group"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-purple-400" />
                                </div>
                                <div>
                                    <p className="font-medium text-white">{page.name}</p>
                                    <p className="text-sm text-slate-400">{page.description}</p>
                                </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

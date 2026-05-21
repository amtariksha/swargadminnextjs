'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders a call-script markdown body (Feature 13). GFM is enabled so the
 * reactivation script's pain-point → counter pairs render as a table.
 * Every element is styled explicitly for the dark admin theme.
 */
const components: Components = {
    h1: ({ children }) => (
        <h1 className="text-xl font-bold text-white mt-4 mb-2 first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-lg font-semibold text-purple-300 mt-4 mb-2">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-base font-semibold text-slate-200 mt-3 mb-1.5">{children}</h3>
    ),
    p: ({ children }) => (
        <p className="text-sm text-slate-300 leading-relaxed mb-2">{children}</p>
    ),
    ul: ({ children }) => (
        <ul className="list-disc pl-5 space-y-1 mb-2 text-sm text-slate-300">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal pl-5 space-y-1 mb-2 text-sm text-slate-300">{children}</ol>
    ),
    li: ({ children }) => <li className="text-sm text-slate-300">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
    em: ({ children }) => <em className="italic text-slate-400">{children}</em>,
    blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-purple-500/50 pl-3 my-2 text-sm text-slate-400 italic">
            {children}
        </blockquote>
    ),
    a: ({ children, href }) => (
        <a href={href} className="text-purple-400 underline" target="_blank" rel="noreferrer">
            {children}
        </a>
    ),
    code: ({ children }) => (
        <code className="px-1 py-0.5 rounded bg-slate-800 text-purple-300 text-xs">{children}</code>
    ),
    hr: () => <hr className="my-3 border-slate-700/50" />,
    table: ({ children }) => (
        <div className="overflow-x-auto my-3">
            <table className="w-full border-collapse border border-slate-700/50 rounded-lg text-sm">
                {children}
            </table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-slate-800/60">{children}</thead>,
    th: ({ children }) => (
        <th className="border border-slate-700/50 px-3 py-2 text-left text-xs font-semibold text-slate-300">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="border border-slate-700/50 px-3 py-2 align-top text-sm text-slate-300">
            {children}
        </td>
    ),
};

interface MarkdownViewProps {
    content: string;
}

export default function MarkdownView({ content }: MarkdownViewProps) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
        </ReactMarkdown>
    );
}

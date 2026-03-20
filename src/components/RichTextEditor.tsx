'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    List,
    ListOrdered,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Link as LinkIcon,
    Image as ImageIcon,
    Heading1,
    Heading2,
    Heading3,
    Highlighter,
    Undo,
    Redo,
    Code,
    Quote,
} from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

interface RichTextEditorProps {
    content: string;
    onChange: (html: string) => void;
    placeholder?: string;
}

export default function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
    const isUpdatingFromProp = useRef(false);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-purple-400 underline' } }),
            ImageExtension.configure({ inline: true }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Underline,
            Color,
            TextStyle,
            Highlight.configure({ multicolor: true }),
        ],
        content,
        onUpdate: ({ editor }) => {
            if (!isUpdatingFromProp.current) {
                onChange(editor.getHTML());
            }
        },
        editorProps: {
            attributes: {
                class: 'prose prose-invert prose-sm max-w-none min-h-[200px] px-4 py-3 focus:outline-none',
            },
        },
    });

    // Sync content prop changes into the editor (e.g., async data load)
    useEffect(() => {
        if (editor && content && editor.getHTML() !== content) {
            isUpdatingFromProp.current = true;
            editor.commands.setContent(content);
            isUpdatingFromProp.current = false;
        }
    }, [content, editor]);

    const addLink = useCallback(() => {
        if (!editor) return;
        const url = window.prompt('Enter URL:');
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    }, [editor]);

    const addImage = useCallback(() => {
        if (!editor) return;
        const url = window.prompt('Enter image URL:');
        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    }, [editor]);

    if (!editor) return null;

    const ToolbarButton = ({
        onClick,
        isActive = false,
        children,
        title,
    }: {
        onClick: () => void;
        isActive?: boolean;
        children: React.ReactNode;
        title: string;
    }) => (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`p-1.5 rounded-lg transition-colors ${
                isActive
                    ? 'bg-purple-600/30 text-purple-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div className="border border-slate-700/50 rounded-xl overflow-hidden bg-slate-900/30">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-slate-700/50 bg-slate-900/50">
                <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold">
                    <Bold className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic">
                    <Italic className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline">
                    <UnderlineIcon className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Strikethrough">
                    <Strikethrough className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} title="Highlight">
                    <Highlighter className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-5 bg-slate-700/50 mx-1" />

                <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Heading 1">
                    <Heading1 className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading 2">
                    <Heading2 className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Heading 3">
                    <Heading3 className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-5 bg-slate-700/50 mx-1" />

                <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet List">
                    <List className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numbered List">
                    <ListOrdered className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Quote">
                    <Quote className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive('codeBlock')} title="Code Block">
                    <Code className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-5 bg-slate-700/50 mx-1" />

                <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Align Left">
                    <AlignLeft className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Align Center">
                    <AlignCenter className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Align Right">
                    <AlignRight className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-5 bg-slate-700/50 mx-1" />

                <ToolbarButton onClick={addLink} isActive={editor.isActive('link')} title="Add Link">
                    <LinkIcon className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={addImage} title="Add Image">
                    <ImageIcon className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-5 bg-slate-700/50 mx-1" />

                <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
                    <Undo className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
                    <Redo className="w-4 h-4" />
                </ToolbarButton>
            </div>

            {/* Editor */}
            <EditorContent editor={editor} />
        </div>
    );
}

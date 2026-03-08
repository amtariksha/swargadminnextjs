'use client';

import { useCallback, useState } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import Image from 'next/image';

interface ImageUploadProps {
    onUpload: (file: File) => void;
    currentImage?: string;
    onRemove?: () => void;
    maxSize?: number; // MB
    accept?: string;
    className?: string;
}

export default function ImageUpload({
    onUpload,
    currentImage,
    onRemove,
    maxSize = 5,
    accept = 'image/png,image/jpeg,image/jpg,image/webp',
    className = '',
}: ImageUploadProps) {
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = useCallback(
        (file: File) => {
            setError(null);
            if (file.size > maxSize * 1024 * 1024) {
                setError(`File must be less than ${maxSize}MB`);
                return;
            }
            if (!file.type.startsWith('image/')) {
                setError('Only image files are allowed');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => setPreview(reader.result as string);
            reader.readAsDataURL(file);
            onUpload(file);
        },
        [maxSize, onUpload]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile]
    );

    const handleRemove = () => {
        setPreview(null);
        setError(null);
        onRemove?.();
    };

    const displayImage = preview || currentImage;

    return (
        <div className={className}>
            {displayImage ? (
                <div className="relative group">
                    <div className="relative w-full h-40 bg-slate-900/50 rounded-xl overflow-hidden border border-slate-700/50">
                        <Image
                            src={displayImage}
                            alt="Upload preview"
                            fill
                            className="object-contain"
                            unoptimized={displayImage.startsWith('data:')}
                        />
                    </div>
                    {(onRemove || preview) && (
                        <button
                            onClick={handleRemove}
                            className="absolute top-2 right-2 p-1.5 bg-red-600/80 hover:bg-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="w-4 h-4 text-white" />
                        </button>
                    )}
                </div>
            ) : (
                <label
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                        isDragging
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-slate-700/50 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/50'
                    }`}
                >
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                        {isDragging ? (
                            <ImageIcon className="w-8 h-8 text-purple-400" />
                        ) : (
                            <Upload className="w-8 h-8" />
                        )}
                        <span className="text-sm">
                            {isDragging ? 'Drop image here' : 'Click or drag image'}
                        </span>
                        <span className="text-xs text-slate-500">Max {maxSize}MB</span>
                    </div>
                    <input
                        type="file"
                        accept={accept}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFile(file);
                            e.target.value = '';
                        }}
                        className="hidden"
                    />
                </label>
            )}
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
    );
}

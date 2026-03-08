'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useProduct, useSubcategories, useUpdateProduct, useUploadProductImage, useDeleteProductImage } from '@/hooks/useData';
import FormField, { inputClassName, selectClassName, textareaClassName } from '@/components/FormField';
import ImageUpload from '@/components/ImageUpload';
import ConfirmDialog from '@/components/ConfirmDialog';
import { IMAGE_BASE_URL } from '@/config/tenant';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

const productSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    qty_text: z.string().min(1, 'Quantity text is required'),
    price: z.number().min(0),
    mrp: z.number().min(0),
    tax: z.number().min(0).max(99),
    stock_qty: z.number().min(0).max(10000),
    subscription: z.number(),
    sub_cat_id: z.number().min(1, 'Subcategory is required'),
    offer_text: z.string().optional(),
    description: z.string().optional(),
    disclaimer: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

export default function EditProductPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data: product, isLoading } = useProduct(id);
    const { data: subcategories = [] } = useSubcategories();
    const updateProduct = useUpdateProduct();
    const uploadImage = useUploadProductImage();
    const deleteImage = useDeleteProductImage();
    const [deleteImageId, setDeleteImageId] = useState<number | null>(null);

    const { register, handleSubmit, reset, formState: { errors } } = useForm<ProductFormData>({
        resolver: zodResolver(productSchema),
    });

    useEffect(() => {
        if (product) {
            reset({
                title: product.title || '',
                qty_text: product.qty_text || '',
                price: product.price || 0,
                mrp: product.mrp || 0,
                tax: product.tax || 0,
                stock_qty: product.stock_qty || 0,
                subscription: product.subscription || 0,
                sub_cat_id: product.sub_cat_id || product.subcategory_id || 0,
                offer_text: product.offer_text || '',
                description: product.description || '',
                disclaimer: product.disclaimer || '',
            });
        }
    }, [product, reset]);

    const onSubmit = async (data: ProductFormData) => {
        try {
            await updateProduct.mutateAsync({ id: Number(id), ...data } as unknown as Record<string, unknown>);
            toast.success('Product updated successfully');
            router.push('/products');
        } catch {
            toast.error('Failed to update product');
        }
    };

    const handleImageUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('id', id);
        formData.append('image_type', '1');
        try {
            await uploadImage.mutateAsync(formData);
            toast.success('Image uploaded');
        } catch {
            toast.error('Failed to upload image');
        }
    };

    const handleDeleteImage = async () => {
        if (deleteImageId === null) return;
        try {
            await deleteImage.mutateAsync({ id: deleteImageId });
            toast.success('Image deleted');
            setDeleteImageId(null);
        } catch {
            toast.error('Failed to delete image');
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-32 bg-slate-800/50 rounded animate-pulse" />
                <div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (!product) {
        return (
            <div className="text-center py-20">
                <p className="text-slate-400">Product not found</p>
                <button onClick={() => router.push('/products')} className="mt-4 text-purple-400">Back to Products</button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white">Edit Product</h1>
                    <p className="text-slate-400">{product.title} - #{id}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-xl p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Product Title" error={errors.title} required>
                        <input {...register('title')} className={inputClassName} />
                    </FormField>
                    <FormField label="Quantity Text" error={errors.qty_text} required>
                        <input {...register('qty_text')} className={inputClassName} />
                    </FormField>
                    <FormField label="Price (₹)" error={errors.price} required>
                        <input {...register('price', { valueAsNumber: true })} type="number" step="0.01" className={inputClassName} />
                    </FormField>
                    <FormField label="MRP (₹)" error={errors.mrp} required>
                        <input {...register('mrp', { valueAsNumber: true })} type="number" step="0.01" className={inputClassName} />
                    </FormField>
                    <FormField label="Tax (%)" error={errors.tax}>
                        <input {...register('tax', { valueAsNumber: true })} type="number" className={inputClassName} />
                    </FormField>
                    <FormField label="Stock Quantity" error={errors.stock_qty}>
                        <input {...register('stock_qty', { valueAsNumber: true })} type="number" className={inputClassName} />
                    </FormField>
                    <FormField label="Subcategory" error={errors.sub_cat_id} required>
                        <select {...register('sub_cat_id', { valueAsNumber: true })} className={selectClassName}>
                            <option value="">Select subcategory</option>
                            {subcategories.map((sc) => (
                                <option key={sc.id} value={sc.id}>{sc.title}</option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Subscription">
                        <select {...register('subscription', { valueAsNumber: true })} className={selectClassName}>
                            <option value={1}>Enabled</option>
                            <option value={0}>Disabled</option>
                        </select>
                    </FormField>
                </div>

                <FormField label="Offer Text" error={errors.offer_text}>
                    <input {...register('offer_text')} className={inputClassName} />
                </FormField>

                <FormField label="Description" error={errors.description}>
                    <textarea {...register('description')} rows={3} className={textareaClassName} />
                </FormField>

                <FormField label="Disclaimer" error={errors.disclaimer}>
                    <textarea {...register('disclaimer')} rows={2} className={textareaClassName} />
                </FormField>

                {/* Existing Images */}
                {product.images && product.images.length > 0 && (
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Current Images</label>
                        <div className="flex flex-wrap gap-3">
                            {product.images.map((img) => (
                                <div key={img.id} className="relative group">
                                    <div className="w-24 h-24 bg-slate-900/50 rounded-xl overflow-hidden border border-slate-700/50">
                                        <Image
                                            src={`${IMAGE_BASE_URL}/${img.image}`}
                                            alt={product.title}
                                            width={96}
                                            height={96}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setDeleteImageId(img.id)}
                                        className="absolute -top-2 -right-2 p-1 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-3 h-3 text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Upload New Image */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Upload New Image</label>
                    <ImageUpload onUpload={handleImageUpload} maxSize={2} />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                    <button type="button" onClick={() => router.back()} className="px-6 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl hover:bg-slate-800">
                        Cancel
                    </button>
                    <button type="submit" disabled={updateProduct.isPending} className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {updateProduct.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>

            <ConfirmDialog
                isOpen={deleteImageId !== null}
                title="Delete Image"
                message="Are you sure you want to delete this image?"
                onConfirm={handleDeleteImage}
                onCancel={() => setDeleteImageId(null)}
                variant="danger"
                confirmText="Delete"
                isLoading={deleteImage.isPending}
            />
        </div>
    );
}

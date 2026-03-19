'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSubcategories, useCreateProduct, useUploadProductImage } from '@/hooks/useData';
import FormField, { inputClassName, selectClassName, textareaClassName } from '@/components/FormField';
import ImageUpload from '@/components/ImageUpload';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

const productSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    qty_text: z.string().min(1, 'Quantity text is required (e.g., 1L, 500g)'),
    price: z.number().min(0, 'Price must be positive'),
    mrp: z.number().min(0, 'MRP must be positive'),
    tax: z.number().min(0).max(99, 'Tax must be 0-99'),
    stock_qty: z.number().min(0).max(10000),
    preferences: z.number().min(0),
    subscription: z.number(),
    is_active: z.number(),
    sub_cat_id: z.number().min(1, 'Subcategory is required'),
    offer_text: z.string().optional(),
    description: z.string().optional(),
    disclaimer: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

export default function AddProductPage() {
    const router = useRouter();
    const { data: subcategories = [] } = useSubcategories();
    const createProduct = useCreateProduct();
    const uploadImage = useUploadProductImage();
    const [imageFile, setImageFile] = useState<File | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<ProductFormData>({
        resolver: zodResolver(productSchema),
        defaultValues: { tax: 0, stock_qty: 100, preferences: 0, subscription: 1, is_active: 1, price: 0, mrp: 0 },
    });

    const onSubmit = async (data: ProductFormData) => {
        try {
            const result = await createProduct.mutateAsync(data as unknown as Record<string, unknown>);
            const productId = (result as { data?: { id?: number } })?.data?.id;

            if (imageFile && productId) {
                const formData = new FormData();
                formData.append('image', imageFile);
                formData.append('id', String(productId));
                formData.append('image_type', '1');
                await uploadImage.mutateAsync(formData);
            }

            toast.success('Product created successfully');
            router.push('/products');
        } catch {
            toast.error('Failed to create product');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white">Add Product</h1>
                    <p className="text-slate-400">Create a new product</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-xl p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Product Title" error={errors.title} required>
                        <input {...register('title')} className={inputClassName} placeholder="Product name" />
                    </FormField>
                    <FormField label="Quantity Text" error={errors.qty_text} required>
                        <input {...register('qty_text')} className={inputClassName} placeholder="e.g., 1L, 500g, 250ml" />
                    </FormField>
                    <FormField label="Price (₹)" error={errors.price} required>
                        <input {...register('price', { valueAsNumber: true })} type="number" step="0.01" className={inputClassName} placeholder="Selling price" />
                    </FormField>
                    <FormField label="MRP (₹)" error={errors.mrp} required>
                        <input {...register('mrp', { valueAsNumber: true })} type="number" step="0.01" className={inputClassName} placeholder="Maximum retail price" />
                    </FormField>
                    <FormField label="Tax (%)" error={errors.tax}>
                        <input {...register('tax', { valueAsNumber: true })} type="number" className={inputClassName} placeholder="Tax percentage" />
                    </FormField>
                    <FormField label="Stock Quantity" error={errors.stock_qty}>
                        <input {...register('stock_qty', { valueAsNumber: true })} type="number" className={inputClassName} placeholder="Available stock" />
                    </FormField>
                    <FormField label="Subcategory" error={errors.sub_cat_id} required>
                        <select {...register('sub_cat_id', { valueAsNumber: true })} className={selectClassName}>
                            <option value="">Select subcategory</option>
                            {subcategories.map((sc) => (
                                <option key={sc.id} value={sc.id}>{sc.title}</option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Preferences (display order)" error={errors.preferences}>
                        <input {...register('preferences', { valueAsNumber: true })} type="number" min={0} className={inputClassName} placeholder="0" />
                    </FormField>
                    <FormField label="Subscription">
                        <select {...register('subscription', { valueAsNumber: true })} className={selectClassName}>
                            <option value={1}>Enabled</option>
                            <option value={0}>Disabled</option>
                        </select>
                    </FormField>
                    <FormField label="Active">
                        <select {...register('is_active', { valueAsNumber: true })} className={selectClassName}>
                            <option value={1}>Active</option>
                            <option value={0}>Inactive</option>
                        </select>
                    </FormField>
                </div>

                <FormField label="Offer Text" error={errors.offer_text}>
                    <input {...register('offer_text')} className={inputClassName} placeholder="e.g., 10% off on monthly subscription" />
                </FormField>

                <FormField label="Description" error={errors.description}>
                    <textarea {...register('description')} rows={3} className={textareaClassName} placeholder="Product description" />
                </FormField>

                <FormField label="Disclaimer" error={errors.disclaimer}>
                    <textarea {...register('disclaimer')} rows={2} className={textareaClassName} placeholder="Product disclaimer" />
                </FormField>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Product Image</label>
                    <ImageUpload onUpload={setImageFile} maxSize={2} />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                    <button type="button" onClick={() => router.back()} className="px-6 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl hover:bg-slate-800">
                        Cancel
                    </button>
                    <button type="submit" disabled={createProduct.isPending} className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {createProduct.isPending ? 'Creating...' : 'Create Product'}
                    </button>
                </div>
            </form>
        </div>
    );
}

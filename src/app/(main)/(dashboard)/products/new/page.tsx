'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSubcategories, useCreateProduct, useUploadProductImage, usePackagingTypes } from '@/hooks/useData';
import { useIntermediates } from '@/hooks/useProduction';
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
    delivery_window: z.number(),
    // Feature 20 Phase 2 — marketing-site visibility (new.swargfood.com).
    // Backend mirrors to Payload's platformVisibility on save.
    web_visible: z.number(),
    offer_text: z.string().optional(),
    description: z.string().optional(),
    disclaimer: z.string().optional(),
    // Feature 07 — returnable packaging linkage.
    is_returnable_packaging: z.boolean().optional(),
    packaging_type_id: z.string().optional(),
    // Feature 17 — back order: sell at zero stock with a tentative date.
    allow_back_order: z.boolean().optional(),
    back_order_next_available: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

export default function AddProductPage() {
    const router = useRouter();
    const { data: subcategories = [] } = useSubcategories();
    const createProduct = useCreateProduct();
    const uploadImage = useUploadProductImage();
    const [imageFile, setImageFile] = useState<File | null>(null);

    // Feature 16 — manufactured (packed) product linkage. Managed outside
    // react-hook-form so an empty number input never trips Zod's NaN check.
    const { data: intermediates = [] } = useIntermediates();
    const [isManufactured, setIsManufactured] = useState(false);
    const [sourceIntermediateId, setSourceIntermediateId] = useState('');
    const [packVolume, setPackVolume] = useState('');

    // Feature 07 — returnable packaging linkage.
    const { data: packagingTypes = [] } = usePackagingTypes(true);

    const { register, handleSubmit, watch, formState: { errors } } = useForm<ProductFormData>({
        resolver: zodResolver(productSchema),
        defaultValues: { tax: 0, stock_qty: 100, preferences: 0, subscription: 1, is_active: 1, price: 0, mrp: 0, is_returnable_packaging: false, packaging_type_id: '', delivery_window: 1, web_visible: 1, allow_back_order: false, back_order_next_available: '' },
    });
    const isReturnablePackaging = !!watch('is_returnable_packaging');
    const allowBackOrder = !!watch('allow_back_order');

    const onSubmit = async (data: ProductFormData) => {
        if (isManufactured && (!sourceIntermediateId || !packVolume)) {
            toast.error('Select a source intermediate and pack volume for a manufactured product');
            return;
        }
        if (data.is_returnable_packaging && !data.packaging_type_id) {
            toast.error('Select a packaging container type for a returnable-packaging product');
            return;
        }
        const backOrder = !!data.allow_back_order;
        if (backOrder) {
            if (!data.back_order_next_available) {
                toast.error('Enter a tentative next-available date for a back-order product');
                return;
            }
            if (data.back_order_next_available <= new Date(Date.now() + 19800000).toISOString().slice(0, 10)) {
                toast.error('The tentative next-available date must be in the future');
                return;
            }
        }
        try {
            const payload = {
                ...data,
                source_intermediate_id: isManufactured && sourceIntermediateId ? Number(sourceIntermediateId) : null,
                pack_volume: isManufactured && packVolume ? parseFloat(packVolume) : null,
                is_returnable_packaging: data.is_returnable_packaging ? 1 : 0,
                packaging_type_id: data.is_returnable_packaging && data.packaging_type_id ? Number(data.packaging_type_id) : null,
                allow_back_order: backOrder ? 1 : 0,
                back_order_next_available: backOrder ? data.back_order_next_available : null,
            };
            const result = await createProduct.mutateAsync(payload as unknown as Record<string, unknown>);
            // Backend returns id at top level: { response: 200, id: 123 }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = result as any;
            const productId = r?.id || r?.data?.id;

            if (imageFile && productId) {
                const formData = new FormData();
                formData.append('image', imageFile);
                formData.append('id', String(productId));
                formData.append('image_type', '1');
                await uploadImage.mutateAsync(formData);
            }

            toast.success('Product created successfully');
            router.push('/products');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create product');
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
                    <FormField label={isManufactured ? 'Stock Quantity (derived — read-only)' : 'Stock Quantity'} error={errors.stock_qty}>
                        <input {...register('stock_qty', { valueAsNumber: true })} type="number" readOnly={isManufactured}
                            className={inputClassName} placeholder="Available stock" />
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
                    <FormField label="Delivery Window" error={errors.delivery_window}>
                        <select {...register('delivery_window', { valueAsNumber: true })} className={selectClassName}>
                            <option value={1}>Morning only</option>
                            <option value={2}>Day-time only</option>
                            <option value={3}>Both</option>
                        </select>
                    </FormField>
                    {/* Feature 20 Phase 2 — marketing-site visibility */}
                    <FormField
                        label="Show on new.swargfood.com"
                        error={errors.web_visible}
                        hint="Controls visibility on the marketing site only. Does not affect the customer app."
                    >
                        <select {...register('web_visible', { valueAsNumber: true })} className={selectClassName}>
                            <option value={1}>Visible on website</option>
                            <option value={0}>Hidden from website</option>
                        </select>
                    </FormField>
                </div>

                {/* Feature 16 — manufactured (packed) product linkage */}
                <div className="border-t border-slate-800/50 pt-4 space-y-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" checked={isManufactured}
                            onChange={(e) => setIsManufactured(e.target.checked)} />
                        Manufactured product — stock is derived live from a bulk intermediate
                    </label>
                    {isManufactured && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Source Intermediate" required>
                                <select value={sourceIntermediateId} onChange={(e) => setSourceIntermediateId(e.target.value)}
                                    className={selectClassName}>
                                    <option value="">Select intermediate</option>
                                    {intermediates.map((ip) => (
                                        <option key={ip.id} value={ip.id}>{ip.name} ({ip.base_unit})</option>
                                    ))}
                                </select>
                            </FormField>
                            <FormField label="Pack Volume (intermediate qty per unit)" required>
                                <input type="number" step="0.001" min="0" value={packVolume}
                                    onChange={(e) => setPackVolume(e.target.value)} className={inputClassName}
                                    placeholder="e.g., 200, 500" />
                            </FormField>
                        </div>
                    )}
                </div>

                {/* Feature 07 — returnable packaging linkage */}
                <div className="border-t border-slate-800/50 pt-4 space-y-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" {...register('is_returnable_packaging')} />
                        Returnable packaging — ships in a glass bottle / container the customer can return
                    </label>
                    {isReturnablePackaging && (
                        <FormField label="Packaging Container Type" required>
                            <select {...register('packaging_type_id')} className={selectClassName}>
                                <option value="">Select packaging type</option>
                                {packagingTypes.map((pt) => (
                                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                                ))}
                            </select>
                        </FormField>
                    )}
                </div>

                {/* Feature 17 — back order */}
                <div className="border-t border-slate-800/50 pt-4 space-y-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" {...register('allow_back_order')} />
                        Allow back order — stays orderable at zero stock with a tentative delivery date
                    </label>
                    {allowBackOrder && (
                        <FormField label="Tentative Next-Available Date" error={errors.back_order_next_available} required>
                            <input {...register('back_order_next_available')} type="date" className={inputClassName} />
                        </FormField>
                    )}
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

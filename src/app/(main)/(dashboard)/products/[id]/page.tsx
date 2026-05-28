'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useProduct, useSubcategories, useUpdateProduct, useUploadProductImage, useDeleteProductImage, usePackagingTypes, useFeatureFlag } from '@/hooks/useData';
import { useIntermediates } from '@/hooks/useProduction';
import FormField, { inputClassName, selectClassName, textareaClassName } from '@/components/FormField';
import ImageUpload from '@/components/ImageUpload';
import ConfirmDialog from '@/components/ConfirmDialog';
import { IMAGE_BASE_URL } from '@/config/tenant';
import { ArrowLeft, Save, Trash2, Upload, X, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { POST } from '@/lib/api';

const productSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    // Variations (migration 032). Optional — auto-generated from title at
    // backend create/update time if blank. Admin can override.
    slug: z.string().optional(),
    qty_text: z.string().min(1, 'Quantity text is required'),
    price: z.number().min(0),
    mrp: z.number().min(0),
    tax: z.number().min(0).max(99),
    stock_qty: z.number().min(0).max(10000),
    preferences: z.number().min(0),
    subscription: z.number(),
    is_active: z.number(),
    sub_cat_id: z.number().min(1, 'Subcategory is required'),
    delivery_window: z.number(),
    offer_text: z.string().optional(),
    description: z.string().optional(),
    disclaimer: z.string().optional(),
    // Feature 16 — manufactured-product linkage. Kept as form fields (not
    // separate state) so reset() can initialise them without a setState effect.
    is_manufactured: z.boolean().optional(),
    source_intermediate_id: z.string().optional(),
    pack_volume: z.string().optional(),
    // Feature 07 — returnable packaging linkage.
    is_returnable_packaging: z.boolean().optional(),
    packaging_type_id: z.string().optional(),
    // Feature 17 — back order: sell at zero stock with a tentative date.
    allow_back_order: z.boolean().optional(),
    back_order_next_available: z.string().optional(),
    // Variations (migration 030). 'simple' = legacy (price/SKU/stock live on
    // product); 'variable' = the variant table holds purchasable units. When
    // variable, stock_managed_at = 'variant' (per-variant pool) or 'parent'
    // (shared pool on product.stock_qty).
    product_type: z.enum(['simple', 'variable']).optional(),
    stock_managed_at: z.enum(['variant', 'parent']).optional(),
    cost_price: z.number().min(0).optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

export default function EditProductPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data: product, isLoading } = useProduct(id);
    const { data: subcategories = [] } = useSubcategories();
    const { data: intermediates = [] } = useIntermediates();
    const { data: packagingTypes = [] } = usePackagingTypes(true);
    const updateProduct = useUpdateProduct();
    const uploadImage = useUploadProductImage();
    const deleteImage = useDeleteProductImage();
    const [deleteImageId, setDeleteImageId] = useState<number | null>(null);
    const [deleteProductConfirm, setDeleteProductConfirm] = useState(false);
    const sliderFileRef = useRef<HTMLInputElement>(null);

    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<ProductFormData>({
        resolver: zodResolver(productSchema),
    });
    const isManufactured = !!watch('is_manufactured');
    const isReturnablePackaging = !!watch('is_returnable_packaging');
    const allowBackOrder = !!watch('allow_back_order');
    const productType = watch('product_type') || 'simple';
    const isVariable = productType === 'variable';
    // Variations (migration 030). When the tenant flag is off, hide every
    // variation-aware UI surface — type toggle, "Variations" header button,
    // stock_managed_at picker. The product can still be 'variable' in the
    // DB; the admin just can't manage it from here until the flag is on.
    const variationsEnabled = useFeatureFlag('enable_variations', false);

    useEffect(() => {
        if (product) {
            reset({
                title: product.title || '',
                slug: product.slug || '',
                qty_text: product.qty_text || '',
                price: product.price || 0,
                mrp: product.mrp || 0,
                tax: product.tax || 0,
                stock_qty: product.stock_qty || 0,
                preferences: product.preferences || 0,
                subscription: product.subscription ?? 1,
                is_active: product.is_active ?? 1,
                sub_cat_id: product.sub_cat_id || product.subcategory_id || 0,
                delivery_window: product.delivery_window ?? 1,
                offer_text: product.offer_text || '',
                description: product.description || '',
                disclaimer: product.disclaimer || '',
                is_manufactured: product.source_intermediate_id != null,
                source_intermediate_id: product.source_intermediate_id != null ? String(product.source_intermediate_id) : '',
                pack_volume: product.pack_volume != null ? String(product.pack_volume) : '',
                is_returnable_packaging: !!product.is_returnable_packaging,
                packaging_type_id: product.packaging_type_id != null ? String(product.packaging_type_id) : '',
                allow_back_order: !!product.allow_back_order,
                back_order_next_available: product.back_order_next_available || '',
                product_type: product.product_type || 'simple',
                stock_managed_at: product.stock_managed_at || 'variant',
                cost_price: product.cost_price ?? undefined,
            });
        }
    }, [product, reset]);

    const onSubmit = async (data: ProductFormData) => {
        const manufactured = !!data.is_manufactured;
        if (manufactured && (!data.source_intermediate_id || !data.pack_volume)) {
            toast.error('Select a source intermediate and pack volume for a manufactured product');
            return;
        }
        const returnablePackaging = !!data.is_returnable_packaging;
        if (returnablePackaging && !data.packaging_type_id) {
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
                id: Number(id),
                ...data,
                source_intermediate_id: manufactured && data.source_intermediate_id ? Number(data.source_intermediate_id) : null,
                pack_volume: manufactured && data.pack_volume ? parseFloat(data.pack_volume) : null,
                is_returnable_packaging: returnablePackaging ? 1 : 0,
                packaging_type_id: returnablePackaging && data.packaging_type_id ? Number(data.packaging_type_id) : null,
                allow_back_order: backOrder ? 1 : 0,
                back_order_next_available: backOrder ? data.back_order_next_available : null,
                // Variations (migration 030). Defaults preserve simple-product
                // behaviour. When 'variable', stock_managed_at decides if the
                // product carries a single shared pool or per-variant stock.
                product_type: data.product_type || 'simple',
                stock_managed_at: data.product_type === 'variable'
                    ? (data.stock_managed_at || 'variant')
                    : 'variant',
                cost_price: data.cost_price != null && data.cost_price !== 0 ? data.cost_price : null,
            };
            await updateProduct.mutateAsync(payload as unknown as Record<string, unknown>);
            toast.success('Product updated successfully');
            router.push('/products');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update product');
        }
    };

    const handleMainImageUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('id', id);
        formData.append('image_type', '1');
        try {
            await uploadImage.mutateAsync(formData);
            toast.success('Main image uploaded');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to upload image');
        }
    };

    const handleSliderImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { toast.error('Image must be less than 2MB'); return; }
        const formData = new FormData();
        formData.append('image', file);
        formData.append('id', id);
        formData.append('image_type', '2');
        try {
            await uploadImage.mutateAsync(formData);
            toast.success('Image uploaded');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to upload image');
        }
        if (sliderFileRef.current) sliderFileRef.current.value = '';
    };

    const handleDeleteImage = async () => {
        if (deleteImageId === null) return;
        try {
            await deleteImage.mutateAsync({ id: deleteImageId, product_id: Number(id) });
            toast.success('Image deleted');
            setDeleteImageId(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete image');
        }
    };

    const handleDeleteProduct = async () => {
        try {
            await POST('/delete_product', { id: Number(id) });
            toast.success('Product deleted');
            router.push('/products');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete product');
        }
    };

    if (isLoading) {
        return <div className="space-y-6"><div className="h-8 w-32 bg-slate-800/50 rounded animate-pulse" /><div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" /></div>;
    }

    if (!product) {
        return <div className="text-center py-20"><p className="text-slate-400">Product not found</p><button onClick={() => router.push('/products')} className="mt-4 text-purple-400">Back to Products</button></div>;
    }

    // Separate main image (type 1) from slider images (type 2)
    const mainImage = product.images?.find(img => img.image_type === 1) || product.images?.[0];
    const sliderImages = product.images?.filter(img => img.image_type === 2) || [];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">Edit Product</h1>
                    <p className="text-slate-400">{product.title} - #{id}</p>
                </div>
                {/* Variations editor — appears when the tenant has the flag
                    enabled (app_setting key `enable_variations`). Migration
                    030 / D-7. */}
                {variationsEnabled && (
                    <button onClick={() => router.push(`/products/${id}/variations`)}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-lg text-sm hover:border-purple-500/50">
                        <Layers className="w-4 h-4" /> Variations
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="lg:col-span-2 glass rounded-xl p-6 space-y-6">
                    <h3 className="text-lg font-semibold text-white">Product Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Product Title" error={errors.title} required>
                            <input {...register('title')} className={inputClassName} />
                        </FormField>
                        {/* Variations (migration 032). URL-safe identifier used in
                            /product/{slug}/[variant-slug] storefront routes.
                            Auto-derived from title at save time if blank. */}
                        <FormField label="Slug — URL identifier" error={errors.slug}>
                            <input {...register('slug')} className={inputClassName}
                                placeholder="auto-generated from title if blank" />
                        </FormField>
                        <FormField label="Quantity Text" error={errors.qty_text} required>
                            <input {...register('qty_text')} className={inputClassName} placeholder="e.g., 1L, 500g" />
                        </FormField>
                        <FormField label="Price (₹)" error={errors.price} required>
                            <input {...register('price', { valueAsNumber: true })} type="number" step="0.01" className={inputClassName} />
                        </FormField>
                        <FormField label="MRP (₹)" error={errors.mrp} required>
                            <input {...register('mrp', { valueAsNumber: true })} type="number" step="0.01" className={inputClassName} />
                        </FormField>
                        <FormField label="Tax (%)" error={errors.tax}>
                            <input {...register('tax', { valueAsNumber: true })} type="number" min={0} max={99} className={inputClassName} />
                        </FormField>
                        <FormField label={isManufactured ? 'Stock Quantity (derived — read-only)' : 'Stock Quantity'} error={errors.stock_qty}>
                            <input {...register('stock_qty', { valueAsNumber: true })} type="number" min={0} max={10000} readOnly={isManufactured} className={inputClassName} />
                        </FormField>
                        <FormField label="Preferences (display order)" error={errors.preferences}>
                            <input {...register('preferences', { valueAsNumber: true })} type="number" min={0} className={inputClassName} />
                        </FormField>
                        <FormField label="Subcategory" error={errors.sub_cat_id} required>
                            <select {...register('sub_cat_id', { valueAsNumber: true })} className={selectClassName}>
                                <option value="">Select subcategory</option>
                                {subcategories.map((sc) => <option key={sc.id} value={sc.id}>{sc.title}</option>)}
                            </select>
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
                    </div>

                    {/* Variations (migration 030) — flips this product between
                        a simple SKU and a Variable Product whose variants are
                        managed at /products/:id/variations. Hidden when the
                        tenant flag is off so unrelated stores never see it. */}
                    {variationsEnabled && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-semibold text-white">Product type</h4>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {isVariable
                                        ? 'Variants are managed at the Variations page. Price / SKU / stock fields above are ignored at storefront.'
                                        : 'Simple product — one SKU, the fields above are the source of truth.'}
                                </p>
                            </div>
                            {isVariable && (
                                <button type="button" onClick={() => router.push(`/products/${id}/variations`)}
                                    className="px-3 py-1.5 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30 whitespace-nowrap">
                                    Manage variations →
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <FormField label="Type">
                                <select {...register('product_type')} className={selectClassName}>
                                    <option value="simple">Simple</option>
                                    <option value="variable">Variable</option>
                                </select>
                            </FormField>
                            {isVariable && (
                                <FormField label="Stock managed at">
                                    <select {...register('stock_managed_at')} className={selectClassName}>
                                        <option value="variant">Per-variant stock</option>
                                        <option value="parent">Shared parent pool</option>
                                    </select>
                                </FormField>
                            )}
                            <FormField label="Cost price (₹) — for margin reports">
                                <input {...register('cost_price', { valueAsNumber: true })}
                                    type="number" step="0.01" min={0} placeholder="Optional"
                                    className={inputClassName} />
                            </FormField>
                        </div>
                    </div>
                    )}

                    {product.cat_title && (
                        <FormField label="Category (read-only)">
                            <input value={product.cat_title} disabled className={`${inputClassName} !text-slate-500 !bg-slate-800/30`} />
                        </FormField>
                    )}

                    {/* Feature 16 — manufactured (packed) product linkage */}
                    <div className="border-t border-slate-800/50 pt-4 space-y-4">
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" {...register('is_manufactured')} />
                            Manufactured product — stock is derived live from a bulk intermediate
                        </label>
                        {isManufactured && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="Source Intermediate" required>
                                    <select {...register('source_intermediate_id')} className={selectClassName}>
                                        <option value="">Select intermediate</option>
                                        {intermediates.map((ip) => (
                                            <option key={ip.id} value={ip.id}>{ip.name} ({ip.base_unit})</option>
                                        ))}
                                    </select>
                                </FormField>
                                <FormField label="Pack Volume (intermediate qty per unit)" required>
                                    <input {...register('pack_volume')} type="number" step="0.001" min="0" className={inputClassName} placeholder="e.g., 200, 500" />
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

                    <h3 className="text-lg font-semibold text-white pt-4 border-t border-slate-800/50">Other Information</h3>
                    <FormField label="Offer Text" error={errors.offer_text}>
                        <input {...register('offer_text')} className={inputClassName} />
                    </FormField>
                    <FormField label="Description" error={errors.description}>
                        <textarea {...register('description')} rows={3} className={textareaClassName} />
                    </FormField>
                    <FormField label="Disclaimer" error={errors.disclaimer}>
                        <textarea {...register('disclaimer')} rows={2} className={textareaClassName} />
                    </FormField>

                    <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                        <button type="button" onClick={() => setDeleteProductConfirm(true)}
                            className="px-4 py-2.5 text-sm bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/30">
                            Delete Product
                        </button>
                        <div className="flex-1" />
                        <button type="button" onClick={() => router.back()} className="px-6 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                        <button type="submit" disabled={updateProduct.isPending}
                            className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl disabled:opacity-50">
                            <Save className="w-4 h-4" /> {updateProduct.isPending ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>

                {/* Right: Images */}
                <div className="space-y-6">
                    {/* Main Image */}
                    <div className="glass rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Product Image</h3>
                        {mainImage ? (
                            <div className="relative group">
                                <img src={`${IMAGE_BASE_URL}/${mainImage.image}`} alt={product.title} className="w-full h-48 rounded-xl object-cover" />
                                <button type="button" onClick={() => setDeleteImageId(mainImage.id)}
                                    className="absolute top-2 right-2 p-1.5 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-3 h-3 text-white" />
                                </button>
                            </div>
                        ) : (
                            <ImageUpload onUpload={handleMainImageUpload} maxSize={2} />
                        )}
                    </div>

                    {/* Additional Images (Slider, image_type=2) */}
                    <div className="glass rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Additional Images ({sliderImages.length}/5)</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {sliderImages.map((img) => (
                                <div key={img.id} className="relative group">
                                    <img src={`${IMAGE_BASE_URL}/${img.image}`} alt="Slider" className="w-full h-24 rounded-xl object-cover" />
                                    <button type="button" onClick={() => setDeleteImageId(img.id)}
                                        className="absolute top-1 right-1 p-1 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                        <X className="w-3 h-3 text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        {sliderImages.length < 5 && (
                            <div className="mt-3">
                                <input ref={sliderFileRef} type="file" accept=".png,.jpg,.jpeg" onChange={handleSliderImageUpload} className="hidden" />
                                <button type="button" onClick={() => sliderFileRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 w-full justify-center bg-slate-800/50 border border-dashed border-slate-700/50 rounded-xl text-sm text-slate-400 hover:text-white hover:border-purple-500/50">
                                    <Upload className="w-4 h-4" /> Add Image
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete Image Confirm */}
            <ConfirmDialog isOpen={deleteImageId !== null} title="Delete Image" message="Are you sure you want to delete this image?"
                onConfirm={handleDeleteImage} onCancel={() => setDeleteImageId(null)} variant="danger" confirmText="Delete" isLoading={deleteImage.isPending} />

            {/* Delete Product Confirm */}
            <ConfirmDialog isOpen={deleteProductConfirm} title="Delete Product" message={`Delete "${product.title}"? This cannot be undone.`}
                onConfirm={handleDeleteProduct} onCancel={() => setDeleteProductConfirm(false)} variant="danger" confirmText="Yes! Delete" />
        </div>
    );
}

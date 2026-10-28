import type { CatalogB2bPrice } from '@/hooks/useAccounting';
import { formatINR } from '@/lib/accounting';

const MAX_SIZES = 3;

interface B2bPriceCellProps {
    /** The product's entry from /accounting/b2b-prices/catalog; absent while loading or without access. */
    entry?: CatalogB2bPrice;
    /** product.b2b_price from the product list, shown until the catalog entry arrives. */
    fallback?: number | null;
}

const Price = ({ value }: { value: number | null | undefined }) =>
    value != null ? <span>{formatINR(value)}</span> : <span className="text-slate-600">—</span>;

/**
 * The common B2B price a shop is billed. A product with sizes is priced per
 * size, so each size is listed; its product-level B2B price is not used.
 */
export function B2bPriceCell({ entry, fallback }: B2bPriceCellProps) {
    if (!entry || entry.sizes.length === 0) {
        return <span className="text-sm"><Price value={entry ? entry.b2b_price : fallback} /></span>;
    }
    const shown = entry.sizes.slice(0, MAX_SIZES);
    const hidden = entry.sizes.length - shown.length;
    return (
        <div className="text-xs leading-5" title={entry.sizes.map((s) =>
            `${s.size}: ${s.b2b_price != null ? formatINR(s.b2b_price) : 'not set'}`).join('\n')}>
            {shown.map((s) => (
                <div key={s.variant_id} className="whitespace-nowrap">
                    <span className="text-slate-400">{s.size}</span> <Price value={s.b2b_price} />
                </div>
            ))}
            {hidden > 0 && <div className="text-slate-500">+{hidden} more</div>}
        </div>
    );
}

import { redirect } from 'next/navigation';

// The Pre-Packing List now lives as a tab on the production-delivery page.
// Kept as a redirect so old links/bookmarks to /pre-packing-list still work.
export default function PrePackingListRedirect() {
    redirect('/production-delivery?tab=prepacking');
}

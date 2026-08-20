/**
 * Public stall pages — their own root layout.
 *
 * The admin panel has no shared src/app/layout.tsx: (main)/layout.tsx is a root
 * layout in its own right, and it is dark-only, wraps everything in
 * AuthProvider + QueryProvider, and registers the admin service worker. None of
 * that belongs on a page a stranger opens by scanning a QR at a market stall.
 *
 * So this route group brings its own <html>/<body>: a LIGHT palette that reads
 * outdoors in daylight, no auth context, no service worker, and nothing that
 * touches localStorage['admin'].
 */
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './stall.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Order · Swarg',
    description: 'Browse the stall menu and order from your phone',
    // Deliberately not indexable: these are per-event URLs, not landing pages.
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    themeColor: '#f8faf7',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5, // never block pinch-zoom — accessibility
};

export default function StallPublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={`${inter.className} bg-[#f8faf7] text-slate-900 antialiased`}>
                {children}
            </body>
        </html>
    );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/lib/query-provider";
import { ThemeProvider } from "@/lib/theme";
import { BRANDING } from "@/config/tenant";
import { Toaster } from "sonner";
import PWARegister from "@/components/PWARegister";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${BRANDING.appName} - Admin Panel`,
  description: "Tenant administration panel for managing orders, products, users and more",
  icons: {
    icon: BRANDING.favicon,
    apple: '/icons/icon-192.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: BRANDING.appName,
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  // Allow zoom — accessibility. Don't block pinch-zoom on mobile.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-white dark:bg-slate-950 dark:text-white antialiased transition-colors duration-200`}>
        <QueryProvider>
          <AuthProvider>
            <ThemeProvider>
              <PWARegister />
              {children}
              <Toaster
                theme="dark"
                position="top-right"
                toastOptions={{
                  style: {
                    background: 'rgba(30, 41, 59, 0.95)',
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    color: '#fff',
                    backdropFilter: 'blur(12px)',
                  },
                }}
              />
            </ThemeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

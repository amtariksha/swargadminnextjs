import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/lib/query-provider";
import { BRANDING } from "@/config/tenant";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${BRANDING.appName} - Admin Panel`,
  description: "Tenant administration panel for managing orders, products, users and more",
  icons: {
    icon: BRANDING.favicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-white antialiased`}>
        <QueryProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

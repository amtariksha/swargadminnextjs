"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/whatsapp/ui/tooltip";
import { AuthProvider } from "@/components/whatsapp/auth-provider";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 30 * 1000,
                        retry: 1,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={200}>
                <AuthProvider>{children}</AuthProvider>
            </TooltipProvider>
        </QueryClientProvider>
    );
}

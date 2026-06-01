"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNumbers } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";

// The inbox is now split per business number (/whatsapp/[number]). This index
// redirects to the default (or first active) number's inbox once numbers load.
export default function InboxIndexPage() {
  const { isLoading } = useNumbers();
  const router = useRouter();
  const numbers = useAppStore((s) => s.numbers);

  useEffect(() => {
    if (numbers.length > 0) {
      const def = numbers.find((n) => n.isDefault) || numbers[0];
      if (def) router.replace(`/whatsapp/${def.number}`);
    }
  }, [numbers, router]);

  return (
    <div className="flex h-full w-full items-center justify-center text-slate-400 text-sm">
      {isLoading
        ? "Loading inbox…"
        : numbers.length === 0
          ? "No WhatsApp numbers configured. Add one in Settings."
          : "Opening inbox…"}
    </div>
  );
}

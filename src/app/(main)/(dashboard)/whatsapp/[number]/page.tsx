"use client";

import { useParams } from "next/navigation";
import { InboxView } from "@/components/whatsapp/inbox/inbox-view";

// Per-number inbox route, e.g. /whatsapp/917090166111. Static siblings
// (/whatsapp/contacts, /whatsapp/broadcast, …) take precedence over this
// dynamic segment, so only real number paths land here.
export default function NumberInboxPage() {
  const params = useParams<{ number: string }>();
  const number = String(params?.number || "");
  return <InboxView number={number} />;
}

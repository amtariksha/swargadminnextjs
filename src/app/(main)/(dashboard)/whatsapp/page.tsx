"use client";

import { useNumbers } from "@/lib/whatsapp/hooks";
import { ChatList } from "@/components/whatsapp/inbox/chat-list";
import { ChatWindow } from "@/components/whatsapp/inbox/chat-window";
import { ContactDetails } from "@/components/whatsapp/inbox/contact-details";
import { useAppStore } from "@/lib/whatsapp/store";

export default function InboxPage() {
  // Initialize numbers on app load
  useNumbers();
  const { activeConversationId } = useAppStore();

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      <ChatList
        className={activeConversationId ? "hidden lg:flex" : "flex w-full lg:w-[340px]"}
      />
      <ChatWindow
        className={activeConversationId ? "flex w-full lg:flex-1" : "hidden lg:flex lg:flex-1"}
      />
      <ContactDetails
        className={activeConversationId ? "hidden lg:block" : "hidden"}
      />
    </div>
  );
}

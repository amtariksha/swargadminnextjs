import { create } from "zustand";
import type { WhatsAppNumber } from "./types";

interface AppState {
    // Sidebar
    sidebarOpen: boolean;
    toggleSidebar: () => void;

    // Active WhatsApp number
    numbers: WhatsAppNumber[];
    activeNumber: WhatsAppNumber | null;
    setNumbers: (numbers: WhatsAppNumber[]) => void;
    setActiveNumber: (number: WhatsAppNumber) => void;

    // Active conversation
    activeConversationId: string | null;
    setActiveConversation: (id: string | null) => void;

    // Contact details panel
    contactPanelOpen: boolean;
    toggleContactPanel: () => void;
    setContactPanelOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
    sidebarOpen: true,
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

    numbers: [],
    activeNumber: null,
    setNumbers: (numbers) =>
        set({
            numbers,
            activeNumber: numbers.find((n) => n.isDefault) || numbers[0] || null,
        }),
    setActiveNumber: (number) => set({ activeNumber: number }),

    activeConversationId: null,
    setActiveConversation: (id) =>
        set({ activeConversationId: id, contactPanelOpen: !!id }),

    contactPanelOpen: false,
    toggleContactPanel: () =>
        set((state) => ({ contactPanelOpen: !state.contactPanelOpen })),
    setContactPanelOpen: (open) => set({ contactPanelOpen: open }),
}));

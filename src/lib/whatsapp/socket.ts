"use client";

import { io, Socket } from "socket.io-client";
import type { IncomingMessageEvent, StatusUpdateEvent } from "./types";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "ws://localhost:3001";

let socket: Socket | null = null;

export function getSocket(): Socket {
    if (!socket) {
        socket = io(SOCKET_URL, {
            autoConnect: false,
            transports: ["websocket"],
        });
    }
    return socket;
}

export function connectSocket() {
    const s = getSocket();
    if (!s.connected) {
        s.connect();
    }
    return s;
}

export function disconnectSocket() {
    if (socket?.connected) {
        socket.disconnect();
    }
}

// ─── Event listeners ───────────────────────────────────────
export function onNewMessage(callback: (event: IncomingMessageEvent) => void) {
    const s = getSocket();
    s.on("new_message", callback);
    return () => {
        s.off("new_message", callback);
    };
}

export function onStatusUpdate(callback: (event: StatusUpdateEvent) => void) {
    const s = getSocket();
    s.on("status_update", callback);
    return () => {
        s.off("status_update", callback);
    };
}

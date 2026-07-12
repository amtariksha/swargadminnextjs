import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strip +, -, spaces from a phone number and ensure it starts with country code.
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s+\-()]/g, "");
  // If it doesn't start with a country code (assume India 91), prepend it
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  return cleaned;
}

/**
 * Check if the WhatsApp 24-hour session window has expired.
 */
export function isSessionExpired(lastIncomingTimestamp: string | null | undefined): boolean {
  if (!lastIncomingTimestamp) return true;
  const last = new Date(lastIncomingTimestamp).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return now - last > twentyFourHours;
}

/**
 * Format a timestamp for display in chat list.
 */
export function formatChatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

/**
 * Generate a simple unique ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Parse template body for variables like {{1}}, {{2}}, etc.
 */
export function parseTemplateVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches)].sort();
}

/**
 * Render a stored WhatsApp message body for display.
 *
 * Template sends persisted through some paths store the RAW MSG91 component-
 * parameter JSON as the body, e.g.
 *   {"body_name":{"type":"text","parameter_name":"name","text":"Rakhi"},
 *    "body_orderno":{...,"text":"171"}, "button_3":{"subtype":"url","text":"SJ28G5ny"}}
 * which renders as unreadable JSON in the inbox + conversation-list preview.
 *
 * Detect that exact shape (EVERY key is a body_/header_/button_/footer_
 * component wrapping an object — so a genuine text message that merely starts
 * with "{" is never touched) and return just the human-facing BODY parameter
 * values joined readably. Button/header URL slugs (a Pay-Now suffix like
 * "SJ28G5ny") are dropped as meaningless to a reader. Any other body passes
 * through untouched. Tolerant of a mixed shape where the button param lacks a
 * `parameter_name` (the reason the webhook's stricter echo-normalizer skips it).
 */
export function renderTemplateBody(raw: unknown): string {
  const body = typeof raw === "string" ? raw : "";
  if (!body || !body.trimStart().startsWith("{")) return body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return body;
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return body;
  const isComponentShape = entries.every(
    ([k, v]) =>
      /^(body|header|button|footer)_/.test(k) &&
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v),
  );
  if (!isComponentShape) return body;
  const texts = entries
    .filter(([k]) => k.startsWith("body_"))
    .map(([, v]) => (v as { text?: unknown }).text)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  if (texts.length) return texts.join(" · ");
  // Component shape but no readable body params (image-only header, etc.).
  return "Template message";
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(text: string, maxLength: number = 40): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}

/**
 * Check if a contact name is a placeholder (phone number, "Unknown", empty).
 */
export function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name || name.trim() === "") return true;
  if (name === "Unknown" || name === "unknown") return true;
  const cleaned = name.replace(/[\s+\-()]/g, "");
  return /^\d{7,15}$/.test(cleaned);
}

/**
 * Get a display-friendly contact name, falling back to formatted phone.
 */
export function getContactDisplayName(contact: { name: string; phone: string }): string {
  return isPlaceholderName(contact.name) ? `+${contact.phone}` : contact.name;
}

/**
 * Get initials for a contact avatar.
 */
export function getContactInitials(contact: { name: string; phone: string }): string {
  if (isPlaceholderName(contact.name)) {
    return contact.phone.slice(-2);
  }
  return contact.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

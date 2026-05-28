import { redirect } from 'next/navigation';

/**
 * Legacy /broadcast route — consolidated into /notifications as of the
 * Send-Notification rewrite. The composer, audience picker, image
 * library hook-up, history table and the new rich-template flow all
 * live at /notifications now. Anything that still links to /broadcast
 * (bookmarks, old emails, deep links) lands here and gets a 307 nudge
 * to the new home.
 *
 * The existing `broadcast` permission key (in Sidebar.tsx's
 * KNOWN_PERMISSION_KEYS) continues to gate /notifications, so RBAC is
 * preserved — no role migration needed.
 */
export default function BroadcastRedirect(): never {
    redirect('/notifications');
}

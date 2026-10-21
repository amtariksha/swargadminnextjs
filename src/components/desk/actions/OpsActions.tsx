'use client';

// STUB written by P3d. Unit P4b replaces the body; the signature stays.
// Placements: 'bar' (day order, holiday), 'delivery' (mark not delivered), 'day_order' (payment link),
// 'match' (link customer). The pane mounts this only when ctx.me.money is true (rule R-4A2).
// Dialogs: inside ActionDrawer only (portal); never Modal / RefundModal / ConfirmDialog directly in the pane.

import type { ReactNode } from 'react';
import type { DeskActionSlotProps } from '@/lib/desk/action-context';

export function OpsActions(props: DeskActionSlotProps): ReactNode {
    void props;
    return null;
}

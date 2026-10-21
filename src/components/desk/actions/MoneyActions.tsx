'use client';

// STUB written by P3d. Unit P4a replaces the body; the signature stays.
// Placements: 'bar' (wallet credit, replacement promise), 'delivery' (refund strip).
// The pane mounts this only when ctx.me.money is true (rule R-4A2).
// Dialogs: inside ActionDrawer only (portal); never Modal / RefundModal / ConfirmDialog directly in the pane.

import type { ReactNode } from 'react';
import type { DeskActionSlotProps } from '@/lib/desk/action-context';

export function MoneyActions(props: DeskActionSlotProps): ReactNode {
    void props;
    return null;
}

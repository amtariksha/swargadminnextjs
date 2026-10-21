'use client';

// STUB written by P3d. Unit P4c replaces the body; the signature stays.
// Placements: 'bar' (new app order, app link), 'subscription' (edit). Always mounted: the app link
// (app_link_sent) is the one action a caller with money:false may record, so P4c hides the others itself.
// Dialogs: inside ActionDrawer only (portal); never Modal / RefundModal / ConfirmDialog directly in the pane.

import type { ReactNode } from 'react';
import type { DeskActionSlotProps } from '@/lib/desk/action-context';

export function AppActions(props: DeskActionSlotProps): ReactNode {
    void props;
    return null;
}

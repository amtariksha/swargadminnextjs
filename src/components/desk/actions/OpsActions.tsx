'use client';

import type { ReactNode } from 'react';
import type { DeskActionSlotProps } from '@/lib/desk/action-context';
import { canSendPaymentLink, needsDayOrderRecord } from '@/lib/desk/ops-actions';
import { DayOrderAction, DayOrderResumeAction } from './DayOrderDrawer';
import { HolidayAction } from './HolidayForm';
import { LinkCustomerButton } from './LinkCustomerButton';
import { MarkNotDeliveredAction } from './MarkNotDeliveredForm';
import { PaymentLinkButton } from './PaymentLinkButton';

/** Day order, holiday, not delivered, link customer, payment link. Nothing for money:false callers or a staff number. */
export function OpsActions({ ctx, placement }: DeskActionSlotProps): ReactNode {
    if (!ctx.me.money || ctx.snapshot.match.kind === 'staff') return null;
    switch (placement.at) {
        case 'bar':
            return (<><DayOrderAction ctx={ctx} /><HolidayAction ctx={ctx} /></>);
        case 'delivery':
            return <MarkNotDeliveredAction ctx={ctx} delivery={placement.delivery} />;
        case 'day_order':
            if (needsDayOrderRecord(placement.dayOrder, ctx.snapshot.recent_actions, ctx.detail.actions)) {
                return <DayOrderResumeAction ctx={ctx} dayOrder={placement.dayOrder} />;
            }
            return canSendPaymentLink(placement.dayOrder) ? <PaymentLinkButton ctx={ctx} dayOrder={placement.dayOrder} /> : null;
        case 'match':
            return <LinkCustomerButton ctx={ctx} />;
        default:
            return null;
    }
}

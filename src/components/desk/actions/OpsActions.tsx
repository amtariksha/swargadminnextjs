'use client';

import type { ReactNode } from 'react';
import type { DeskActionSlotProps } from '@/lib/desk/action-context';
import { canSendPaymentLink, isStaffMatch, needsDayOrderRecord } from '@/lib/desk/ops-actions';
import { DayOrderAction, DayOrderResumeAction } from './DayOrderDrawer';
import { HolidayAction } from './HolidayForm';
import { LinkCustomerButton } from './LinkCustomerButton';
import { MarkNotDeliveredAction } from './MarkNotDeliveredForm';
import { PaymentLinkButton } from './PaymentLinkButton';

/**
 * Day order, holiday, not delivered, link customer, payment link. `offer` is false for money:false callers and for a
 * staff number: it hides the trigger buttons only. A drawer that is already open stays mounted (a saved backend step
 * whose record failed must keep its Retry), so no branch below may return early on row state.
 */
export function OpsActions({ ctx, placement }: DeskActionSlotProps): ReactNode {
    const offer = ctx.me.money && !isStaffMatch(ctx.snapshot);
    switch (placement.at) {
        case 'bar':
            return (<><DayOrderAction ctx={ctx} offer={offer} /><HolidayAction ctx={ctx} offer={offer} /></>);
        case 'delivery':
            return <MarkNotDeliveredAction ctx={ctx} delivery={placement.delivery} offer={offer} />;
        case 'day_order': {
            const needsRecord = needsDayOrderRecord(placement.dayOrder, ctx.snapshot.recent_actions, ctx.detail.actions, ctx.ticket);
            return (
                <>
                    <DayOrderResumeAction ctx={ctx} dayOrder={placement.dayOrder} offer={offer && needsRecord} />
                    <PaymentLinkButton ctx={ctx} dayOrder={placement.dayOrder} offer={offer && !needsRecord && canSendPaymentLink(placement.dayOrder)} />
                </>
            );
        }
        case 'match':
            return <LinkCustomerButton ctx={ctx} offer={offer} />;
        default:
            return null;
    }
}

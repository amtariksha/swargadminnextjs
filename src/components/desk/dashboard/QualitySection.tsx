import { PulseSection } from '@/components/pulse/shared';
import { formatPct, formatRate } from '@/components/desk/reports/format';
import type { DeskStats } from '@/lib/desk/types';
import { Tile } from './NowTiles';

export function QualitySection({ quality, isLoading }: { quality: DeskStats['quality'] | undefined; isLoading: boolean }) {
    return (
        <PulseSection
            title="Quality"
            subtitle="How often a problem comes back, and how much of the work is done inside Desk."
            isLoading={isLoading}
            isEmpty={false}
            emptyText=""
        >
            {quality ? (
                <>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                        <Tile label="Reopen rate" value={formatRate(quality.reopen_rate)} />
                        <Tile label="Re-contact within 72 h" value={formatRate(quality.recontact_72h_rate)} />
                        <Tile label="Classified" value={formatPct(quality.classified_pct)} />
                        <Tile label="Handled in Desk" value={formatPct(quality.handled_in_desk_pct)} />
                        <Tile label="Left out (internal, spam, wrong no.)" value={quality.excluded_tickets} />
                    </div>
                    <p className="text-xs text-slate-500">
                        Tickets resolved in the last 72 hours can still be re-contacted. Internal, spam and wrong-number tickets are left out of every other number.
                    </p>
                </>
            ) : null}
        </PulseSection>
    );
}

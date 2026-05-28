'use client';

import { Users, UserSearch, Truck } from 'lucide-react';
import CustomerMultiSelect from '@/components/CustomerMultiSelect';
import DriverPicker from '@/components/DriverPicker';
import { useAudienceCount, type AudienceType } from './useAudienceCount';

interface AudienceSelectorProps {
    audienceType: AudienceType;
    onAudienceTypeChange: (t: AudienceType) => void;

    userIds: number[];
    onUserIdsChange: (ids: number[]) => void;

    driverUserId: number | '';
    onDriverUserIdChange: (id: number | '') => void;
}

const TYPES: { value: AudienceType; label: string; description: string; Icon: typeof Users }[] = [
    {
        value: 'all',
        label: 'All users',
        description: 'Every customer with a registered FCM token (bell channel always on).',
        Icon: Users,
    },
    {
        value: 'custom',
        label: 'Specific customers',
        description: 'Pick customers by name or phone.',
        Icon: UserSearch,
    },
    {
        value: 'driver',
        label: 'By delivery route',
        description: "Customers assigned to one driver's route.",
        Icon: Truck,
    },
];

/**
 * The composer's Audience section. Three options with a live recipient
 * count that calls /broadcast/audience_count. Count refreshes when the
 * audience input changes; 'custom' is derived client-side from the
 * length of the selected ids.
 */
export default function AudienceSelector({
    audienceType,
    onAudienceTypeChange,
    userIds,
    onUserIdsChange,
    driverUserId,
    onDriverUserIdChange,
}: AudienceSelectorProps) {
    const { count, isLoading, ready } = useAudienceCount({
        type: audienceType,
        userIds,
        driverUserId,
    });

    return (
        <div className="glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-white">Audience</h2>
                    <p className="text-sm text-slate-400">Who should receive this?</p>
                </div>
            </div>

            <div className="grid gap-2">
                {TYPES.map(({ value, label, description, Icon }) => (
                    <button
                        type="button"
                        key={value}
                        onClick={() => onAudienceTypeChange(value)}
                        className={`flex items-start gap-3 p-4 rounded-xl text-left transition-colors border ${
                            audienceType === value
                                ? 'bg-blue-500/10 border-blue-500/40'
                                : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
                        }`}
                    >
                        <Icon
                            className={`w-5 h-5 mt-0.5 ${
                                audienceType === value ? 'text-blue-400' : 'text-slate-400'
                            }`}
                        />
                        <div>
                            <p className="font-medium text-white">{label}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                        </div>
                    </button>
                ))}
            </div>

            {audienceType === 'custom' && (
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Customers
                    </label>
                    <CustomerMultiSelect value={userIds} onChange={onUserIdsChange} />
                </div>
            )}

            {audienceType === 'driver' && (
                <DriverPicker value={driverUserId} onChange={onDriverUserIdChange} />
            )}

            <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 px-4 py-3 text-sm">
                {ready && typeof count === 'number' ? (
                    <p className="text-white">
                        <span className="font-semibold">{count.toLocaleString()}</span>{' '}
                        <span className="text-slate-400">
                            {count === 1 ? 'customer' : 'customers'} will receive this
                        </span>
                    </p>
                ) : isLoading ? (
                    <p className="text-slate-400">Counting recipients…</p>
                ) : (
                    <p className="text-slate-400">
                        {audienceType === 'custom'
                            ? 'Pick at least one customer.'
                            : audienceType === 'driver'
                              ? 'Pick a driver to see their route size.'
                              : '—'}
                    </p>
                )}
            </div>
        </div>
    );
}

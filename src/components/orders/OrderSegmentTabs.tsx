export type OrderSegment = 'all' | 'b2c' | 'b2b';

const SEGMENTS: { key: OrderSegment; label: string; hint: string }[] = [
    { key: 'all', label: 'All orders', hint: 'Every order' },
    { key: 'b2c', label: 'B2C', hint: 'Home-delivery customers' },
    { key: 'b2b', label: 'B2B', hint: 'Shops — customers marked as a B2B shop, delivered by truck' },
];

interface OrderSegmentTabsProps {
    value: OrderSegment;
    counts: Record<OrderSegment, number>;
    onChange: (segment: OrderSegment) => void;
}

export function OrderSegmentTabs({ value, counts, onChange }: OrderSegmentTabsProps) {
    return (
        <div role="tablist" aria-label="Order type" className="flex gap-1 p-1 glass rounded-xl w-fit">
            {SEGMENTS.map(({ key, label, hint }) => {
                const active = key === value;
                return (
                    <button key={key} type="button" role="tab" aria-selected={active} title={hint}
                        onClick={() => onChange(key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${active
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
                        {label}
                        <span className={`ml-2 text-xs ${active ? 'text-white/80' : 'text-slate-500'}`}>{counts[key]}</span>
                    </button>
                );
            })}
        </div>
    );
}

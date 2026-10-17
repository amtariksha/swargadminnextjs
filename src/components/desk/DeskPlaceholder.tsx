export function DeskPlaceholder({ title, unit }: { title: string; unit: string }) {
    return (
        <div className="p-6">
            <h1 className="text-xl font-semibold text-white">{title}</h1>
            <p className="mt-2 text-sm text-slate-400">This screen is built in unit {unit}.</p>
        </div>
    );
}

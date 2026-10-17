'use client';

import { selectClassName } from '@/components/FormField';
import { useAssignableUsers } from '@/lib/whatsapp/use-assignable-users';

interface AssigneePickerProps {
    onPick: (staffId: string) => void;
}

/** The only backend call of the queue screens: the staff list, fetched when this mounts (after a click). */
export function AssigneePicker({ onPick }: AssigneePickerProps) {
    const { users, isPending, isError } = useAssignableUsers();
    if (isPending) return <span className="text-xs text-slate-400">Loading staff…</span>;
    if (isError) return <span className="text-xs text-red-300">Could not load staff.</span>;
    return (
        <select
            defaultValue=""
            onChange={(event) => { if (event.target.value !== '') onPick(event.target.value); }}
            className={`${selectClassName} !w-auto !py-1 text-xs`}
        >
            <option value="" disabled>Choose person…</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
    );
}

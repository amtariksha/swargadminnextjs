import { redirect } from 'next/navigation';

export default function DairyPickupRedirect() {
    redirect('/delivery-list');
}

import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect root to delivery-list (the default dashboard page)
  redirect('/delivery-list');
}

// Delivery-app capability catalog — shared by the Roles page (per-role caps,
// role.delivery_permissions) and the Admin Users page (per-user override,
// user.delivery_permissions). The backend UNIONs role caps + user caps to
// decide which pages the delivery app shows. Keys must stay in sync with the
// delivery app's capability checks.
export const DELIVERY_PERMISSIONS: { key: string; label: string; icon: string }[] = [
    // Last-mile / morning customer doorstep delivery (legacy role-4 screen).
    { key: 'milk-delivery', label: 'Milk Delivery (last-mile)', icon: '🥛' },
    // Truck route — drop-points + shops with mark-delivered (legacy role-5 screen).
    { key: 'truck-delivery', label: 'Truck Deliveries (drop points)', icon: '🚚' },
    { key: 'collection-pickup', label: 'Collection Pickup', icon: '🧺' },
    // Scan Bill — capture any purchase bill via OCR → draft (Phase G). Backend
    // gate: requireDeliveryPermission(['purchase-capture','collection-pickup']).
    { key: 'purchase-capture', label: 'Scan Bill (purchase capture)', icon: '🧾' },
    { key: 'production-supervisor', label: 'Production Supervisor', icon: '🏭' },
    { key: 'day-production-support', label: 'Day Production Support', icon: '🛠️' },
    // Lets a non-day-driver (e.g. a production supervisor) cover the day-time
    // delivery pool when the day driver is on leave.
    { key: 'day-delivery', label: 'Day Deliveries', icon: '🛵' },
    { key: 'collection-approval', label: 'Collection Approval', icon: '✅' },
    { key: 'dairy-receipt', label: 'Dairy Receipt (Milk Received)', icon: '🐄' },
    { key: 'whatsapp-inbox', label: 'WhatsApp Inbox (Customer Care)', icon: '💬' },
    // Stall POS. TWO keys, and the difference is money:
    //   stall-till   ring up sales, take cash/UPI, send payment links, and see
    //                the day's takings.
    //   stall-queue  the counter board only — see tickets, mark ready, hand
    //                over. Cannot create an order, cannot settle one, and the
    //                backend withholds the day's totals from it entirely.
    // Holding stall-till implies stall-queue; whoever handles the cash box also
    // works the board. Enforced server-side by requireStallRight
    // (swargnodejsbackend/src/middleware/stallAuth.js) — these keys are the
    // grant, not the security boundary.
    { key: 'stall-till', label: 'Stall Till (takes money)', icon: '🧾' },
    { key: 'stall-queue', label: 'Stall Counter (no money)', icon: '🔔' },
];

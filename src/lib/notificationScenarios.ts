/**
 * Typed mirror of NOTIFICATION_SCENARIOS in swargnodejsbackend's
 * src/utils/notificationCategories.js.
 *
 * The admin Send-Notification composer needs the scenario list, tokens,
 * and default copy at render time without a round-trip — and the
 * backend's `/api/notification_images` only returns the rows that have
 * an image_url, not the full scenario set. Keeping this list mirrored
 * locally is the smallest workable answer.
 *
 * Keep in sync when adding scenarios on the backend.
 */

export interface NotificationScenario {
    /** Slug — must match a backend SCENARIO_SLUGS entry exactly. */
    scenario: string;
    /** Human-readable label shown in the composer's dropdown. */
    label: string;
    /** Feature-08 category — drives per-customer preference gating. */
    category:
        | 'order'
        | 'delivery'
        | 'low_balance'
        | 'partial_delivery'
        | 'promotions'
        | 'wallet';
    /**
     * Token names referenced as `{name}` inside the default title/body.
     * The composer renders one input per token. Only the two
     * operator-driven broadcast scenarios declare these today;
     * auto-trigger scenarios omit `tokens`.
     */
    tokens?: string[];
    /** Pre-fill for the composer's title field. */
    defaultTitle?: string;
    /** Pre-fill for the composer's body field. */
    defaultBody?: string;
}

export const NOTIFICATION_SCENARIOS: NotificationScenario[] = [
    { scenario: 'order_placed',          label: 'Order placed',          category: 'order' },
    { scenario: 'order_delivered',       label: 'Order delivered',       category: 'delivery' },
    { scenario: 'order_status_changed',  label: 'Order status changed',  category: 'order' },
    { scenario: 'partial_delivery',      label: 'Partial delivery',      category: 'partial_delivery' },
    { scenario: 'low_wallet',            label: 'Low wallet balance',    category: 'low_balance' },
    { scenario: 'wallet_updated',        label: 'Wallet updated',        category: 'wallet' },
    { scenario: 'welcome_user',          label: 'Welcome',               category: 'promotions' },
    { scenario: 'broadcast',             label: 'Broadcast (default)',   category: 'promotions' },
    { scenario: 'product_back_in_stock', label: 'Product back in stock', category: 'promotions' },
    {
        scenario: 'supply_cancelled',
        label: 'Supply cancelled (with reason)',
        category: 'delivery',
        tokens: ['reason'],
        defaultTitle: "Today's delivery is cancelled",
        defaultBody:
            "We're sorry — today's delivery has been cancelled. {reason} We'll be back tomorrow as usual.",
    },
    {
        scenario: 'delayed_delivery',
        label: 'Delivery delayed (morning round)',
        category: 'delivery',
        tokens: ['minutes', 'reason'],
        defaultTitle: 'Delivery delayed',
        defaultBody:
            "Today's delivery is delayed by about {minutes} minutes. {reason} Thank you for your patience.",
    },
];

export const SCENARIO_BY_SLUG: Record<string, NotificationScenario> =
    Object.fromEntries(NOTIFICATION_SCENARIOS.map((s) => [s.scenario, s]));

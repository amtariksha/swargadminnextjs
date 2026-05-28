/**
 * Admin-side TypeScript types for the Phase H review feature.
 * Mirror of the backend `review` table + the moderation endpoints.
 */

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export interface Review {
    id: number;
    user_id: number;
    product_id: number;
    variant_id: number | null;
    rating: number;
    title: string | null;
    body: string | null;
    status: ReviewStatus;
    verified_purchase: number;
    admin_response: string | null;
    admin_response_at: string | null;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
    // Joined fields the backend admin endpoint surfaces
    user_name?: string;
    user_phone?: string;
    product_title?: string;
    variant_slug?: string | null;
}

export interface ReviewUpdatePayload {
    status?: ReviewStatus;
    admin_response?: string | null;
}

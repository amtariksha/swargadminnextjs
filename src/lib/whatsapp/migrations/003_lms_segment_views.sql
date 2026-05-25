-- ============================================================================
-- Swarg LMS — Phase 1 · Migration 003
-- Views that power the Segment Filter DSL evaluator
-- ============================================================================
--
-- The DSL spec (requirements §2.7) lets operators compose filters like
-- "has_tag", "rfm_segment_in", "consent", "received_campaign_within_days".
-- We evaluate the DSL in TypeScript by issuing one Supabase query per leaf
-- node and intersecting/unioning the result sets in app code.
--
-- For complex queries (latest-consent-per-purpose, recent campaigns) we
-- need a few helper views to keep app-side logic simple and PostgREST-
-- queryable. All views live in app_lms and inherit RLS from the base
-- tables — service_role reads them; everyone else denied by default.
--
-- Idempotent. Safe to re-run. Drops any prior version first.
-- ============================================================================

SET search_path = app_lms, public;

-- ─── v_lms_customer_tags_flat ──────────────────────────────────────────────
-- Denormalises lms_customer_tags + lms_tags so the DSL can query by tag
-- name + namespace in one .from() call.
DROP VIEW IF EXISTS app_lms.v_lms_customer_tags_flat;
CREATE VIEW app_lms.v_lms_customer_tags_flat AS
SELECT
    ct.customer_id,
    t.id          AS tag_id,
    t.org_id,
    t.name        AS tag_name,
    t.namespace,
    ct.source,
    ct.assigned_at,
    ct.expires_at,
    -- whether this row is currently effective (expires_at NULL or in future)
    (ct.expires_at IS NULL OR ct.expires_at > NOW()) AS effective
FROM app_lms.lms_customer_tags ct
JOIN app_lms.lms_tags t ON t.id = ct.tag_id;

COMMENT ON VIEW app_lms.v_lms_customer_tags_flat IS
    'Denormalised tag assignments. effective=TRUE if expires_at IS NULL OR > NOW().';


-- ─── v_lms_customer_consent_effective ──────────────────────────────────────
-- Latest consent row per (customer_id, purpose). The append-only ledger
-- pattern means "effective" = most recent insertion. DISTINCT ON gets one
-- row per group at the cost of a single sort.
DROP VIEW IF EXISTS app_lms.v_lms_customer_consent_effective;
CREATE VIEW app_lms.v_lms_customer_consent_effective AS
SELECT DISTINCT ON (customer_id, purpose)
    customer_id,
    org_id,
    purpose,
    granted,
    source,
    notice_version,
    language,
    created_at AS as_of
FROM app_lms.lms_consent_records
ORDER BY customer_id, purpose, created_at DESC;

COMMENT ON VIEW app_lms.v_lms_customer_consent_effective IS
    'Most recent consent row per (customer_id, purpose). The "effective" state.';


-- ─── v_lms_customer_last_campaign ──────────────────────────────────────────
-- Most recent campaign message sent to each customer. Powers the
-- "received_campaign_within_days" DSL node.
DROP VIEW IF EXISTS app_lms.v_lms_customer_last_campaign;
CREATE VIEW app_lms.v_lms_customer_last_campaign AS
SELECT
    customer_id,
    MAX(sent_at)              AS last_sent_at,
    MAX(delivered_at)         AS last_delivered_at,
    MAX(read_at)              AS last_read_at,
    COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '7 days')   AS sent_last_7d,
    COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '30 days')  AS sent_last_30d
FROM app_lms.lms_campaign_messages
WHERE sent_at IS NOT NULL
GROUP BY customer_id;

COMMENT ON VIEW app_lms.v_lms_customer_last_campaign IS
    'Rolled-up campaign-send timestamps per customer for frequency cap and recency checks.';


-- ============================================================================
-- Verify:
--   SELECT table_name FROM information_schema.views
--    WHERE table_schema = 'app_lms'
--    ORDER BY table_name;
--
-- Expected 3 views:
--   v_lms_customer_consent_effective
--   v_lms_customer_last_campaign
--   v_lms_customer_tags_flat
-- ============================================================================

-- ============================================================================
-- Swarg LMS — Phase 1 Foundation Schema
-- Migration 001 · creates the app_lms schema and all Phase 1 tables.
-- ============================================================================
--
-- Source of truth: /home/pradeep/Downloads/swarg-requirements.md (§2)
-- Architectural decisions (locked):
--   • All LMS tables live in the WACRM Supabase Postgres project, schema `app_lms`.
--   • Every table name carries the `lms_` prefix.
--   • Append-only ledgers (consent, loyalty) are NEVER UPDATE'd — withdrawals
--     and adjustments are new rows. Effective state is the latest row.
--   • Tenant scoping via org_id everywhere (consistent with existing WACRM
--     `contacts`/`conversations` tables in the `public` schema).
--   • Foreign keys to admin panel `admin_users` (MySQL) and to MySQL
--     `customers`/`orders` are stored as opaque UUIDs/IDs without DB-level FK —
--     they live in a different database. Integrity enforced at application layer.
--   • UUID PKs throughout to match WACRM's existing conventions.
--
-- Run-once steps (operator):
--   1. Open Supabase Studio → SQL Editor for the WACRM project.
--   2. Paste this entire file.
--   3. Run.  Idempotent: every CREATE uses IF NOT EXISTS.
--   4. Verify with: SELECT table_name FROM information_schema.tables
--                   WHERE table_schema = 'app_lms' ORDER BY table_name;
--      Expected: 22 tables + 1 view.
--
-- Future migrations: 002_*.sql, 003_*.sql, etc.  Never edit this file
-- after it has been applied to production.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app_lms;

SET search_path = app_lms, public;

-- ─── §2.1 · Consent Records (append-only DPDP ledger) ───────────────────────
-- Latest row per (customer_id, purpose) is the effective consent.
-- Withdrawals are new rows with granted=false. Never UPDATE or DELETE.

CREATE TABLE IF NOT EXISTS app_lms.lms_consent_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    customer_id     UUID NOT NULL,
    purpose         TEXT NOT NULL CHECK (purpose IN (
                        'transactional_orders',
                        'marketing_in_app',
                        'marketing_whatsapp',
                        'marketing_email',
                        'marketing_sms',
                        'analytics_cookies',
                        'personalisation'
                    )),
    granted         BOOLEAN NOT NULL,
    source          TEXT NOT NULL CHECK (source IN (
                        'signup','preference_center','whatsapp_keyword',
                        'in_app_toggle','checkout','phone_call','stall','import',
                        'legitimate_interest_backfill'
                    )),
    notice_version  TEXT NOT NULL,
    language        TEXT NOT NULL DEFAULT 'en',
    ip_hash         TEXT,
    user_agent      TEXT,
    granted_at      TIMESTAMPTZ,
    withdrawn_at    TIMESTAMPTZ,
    evidence_blob   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_consent_customer_purpose
    ON app_lms.lms_consent_records (customer_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lms_consent_org
    ON app_lms.lms_consent_records (org_id, created_at DESC);

-- ─── §2.2 · Tags + Customer Tags + Segments ─────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    name            TEXT NOT NULL,
    namespace       TEXT NOT NULL CHECK (namespace IN (
                        'channel','product','festival','context','behaviour','custom'
                    )),
    color           TEXT,
    auto_rule_json  JSONB,  -- declarative rule for auto-tagging; NULL = manual only
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, namespace, name)
);

CREATE INDEX IF NOT EXISTS idx_lms_tags_org_namespace
    ON app_lms.lms_tags (org_id, namespace);

CREATE TABLE IF NOT EXISTS app_lms.lms_customer_tags (
    customer_id     UUID NOT NULL,
    tag_id          UUID NOT NULL REFERENCES app_lms.lms_tags(id) ON DELETE CASCADE,
    source          TEXT NOT NULL CHECK (source IN ('auto','manual','imported')),
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,  -- e.g. festival tags expire 365 days after assignment
    PRIMARY KEY (customer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_customer_tags_customer
    ON app_lms.lms_customer_tags (customer_id);

CREATE INDEX IF NOT EXISTS idx_lms_customer_tags_expires
    ON app_lms.lms_customer_tags (expires_at)
    WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_lms.lms_segments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    filter_dsl          JSONB NOT NULL,       -- AST per spec §2.7
    estimated_size      INTEGER,
    last_computed_at    TIMESTAMPTZ,
    is_dynamic          BOOLEAN NOT NULL DEFAULT TRUE,  -- TRUE=recompute nightly, FALSE=frozen snapshot
    created_by_user_id  UUID,                 -- admin_users.id (MySQL)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS app_lms.lms_segment_memberships (
    segment_id      UUID NOT NULL REFERENCES app_lms.lms_segments(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (segment_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_seg_membership_customer
    ON app_lms.lms_segment_memberships (customer_id);

-- ─── §2.3 · RFM + Customer Health Score ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_rfm_scores (
    customer_id     UUID PRIMARY KEY,
    org_id          UUID NOT NULL,
    recency_days    INTEGER NOT NULL,
    recency_score   SMALLINT NOT NULL CHECK (recency_score BETWEEN 1 AND 5),
    frequency_count INTEGER NOT NULL,
    frequency_score SMALLINT NOT NULL CHECK (frequency_score BETWEEN 1 AND 5),
    monetary_value  NUMERIC(12,2) NOT NULL,
    monetary_score  SMALLINT NOT NULL CHECK (monetary_score BETWEEN 1 AND 3),
    segment         TEXT NOT NULL,  -- 'Champions' | 'Loyal' | 'Promising' | 'At-Risk' | 'Hibernating' | 'Lost'
    computed_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lms_rfm_org_segment
    ON app_lms.lms_rfm_scores (org_id, segment);

CREATE TABLE IF NOT EXISTS app_lms.lms_health_scores (
    customer_id         UUID PRIMARY KEY,
    org_id              UUID NOT NULL,
    score               INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    churn_risk          TEXT NOT NULL CHECK (churn_risk IN ('low','medium','high')),
    next_best_action    TEXT,           -- e.g. 'replenishment_ghee', 'winback_d30'
    reason_blob         JSONB,          -- which signals drove the score
    computed_at         TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lms_health_churn_risk
    ON app_lms.lms_health_scores (org_id, churn_risk);

-- ─── §2.4 · Campaigns ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_campaigns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL,
    name                TEXT NOT NULL,
    segment_id          UUID NOT NULL REFERENCES app_lms.lms_segments(id),
    status              TEXT NOT NULL CHECK (status IN (
                            'draft','pending_approval','scheduled',
                            'sending','sent','cancelled','failed'
                        )),
    channels            TEXT[] NOT NULL,       -- e.g. {'whatsapp','in_app','email'}
    content_id          UUID,                  -- → lms_campaign_contents (1:N inverse)
    scheduled_at        TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ,
    created_by_user_id  UUID NOT NULL,
    approved_by_user_id UUID,
    approved_at         TIMESTAMPTZ,
    ai_drafted          BOOLEAN NOT NULL DEFAULT FALSE,
    agent_force_run_id  UUID,                  -- traceability to Agent Force run
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_campaigns_org_status
    ON app_lms.lms_campaigns (org_id, status, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS app_lms.lms_campaign_contents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES app_lms.lms_campaigns(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL,         -- 'whatsapp' | 'in_app' | 'email'
    variant         TEXT NOT NULL DEFAULT 'default',
    -- WhatsApp
    wa_template_name TEXT,
    wa_template_lang TEXT,
    wa_params       JSONB,
    -- In-app
    inapp_title     TEXT,
    inapp_body      TEXT,
    inapp_image     TEXT,
    inapp_cta_url   TEXT,
    -- Email
    email_subject   TEXT,
    email_html      TEXT,
    email_text      TEXT
);

CREATE TABLE IF NOT EXISTS app_lms.lms_campaign_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID NOT NULL REFERENCES app_lms.lms_campaigns(id) ON DELETE CASCADE,
    customer_id         UUID NOT NULL,
    channel             TEXT NOT NULL,
    purpose             TEXT NOT NULL,    -- routing purpose (txn_* / mkt_*), enforces 2-number rule
    status              TEXT NOT NULL,    -- queued|sent|delivered|read|clicked|converted|failed|skipped_consent|skipped_cap
    provider_msg_id     TEXT,             -- Meta wamid / email message-id / in-app msg id
    queued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at             TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    read_at             TIMESTAMPTZ,
    clicked_at          TIMESTAMPTZ,
    converted_at        TIMESTAMPTZ,
    converted_order_id  UUID,             -- MySQL orders.id (no FK)
    failure_reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_lms_campmsg_customer
    ON app_lms.lms_campaign_messages (customer_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_lms_campmsg_campaign_status
    ON app_lms.lms_campaign_messages (campaign_id, status);

-- ─── §2.5 · Leads ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_leads (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL,
    source                  TEXT NOT NULL CHECK (source IN (
                                'whatsapp','phone','website_form','app_install',
                                'stall','referral','social','geo_ai','organic_search',
                                'csv_import','manual','other'
                            )),
    source_details          JSONB,        -- e.g. CTWA ad metadata, form URL, referrer id
    name                    TEXT,
    phone                   TEXT,
    email                   TEXT,
    pincode                 TEXT,
    language                TEXT NOT NULL DEFAULT 'en',
    status                  TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                                'new','contacted','qualified','converted','lost','duplicate'
                            )),
    owner_user_id           UUID,          -- assigned CS / sales team member (admin_users.id)
    score                   INTEGER,       -- 0-100, set by Lead Triage agent
    tags                    TEXT[],
    first_touch_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at        TIMESTAMPTZ,
    converted_customer_id   UUID,
    converted_at            TIMESTAMPTZ,
    notes                   TEXT,
    metadata                JSONB
);

CREATE INDEX IF NOT EXISTS idx_lms_leads_org_status
    ON app_lms.lms_leads (org_id, status, last_activity_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lms_leads_owner
    ON app_lms.lms_leads (owner_user_id)
    WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lms_leads_phone
    ON app_lms.lms_leads (phone)
    WHERE phone IS NOT NULL;

-- ─── §2.6 · Loyalty + Referrals ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_loyalty_accounts (
    customer_id         UUID PRIMARY KEY,
    org_id              UUID NOT NULL,
    tier                TEXT,
    points_balance      INTEGER NOT NULL DEFAULT 0,
    lifetime_points     INTEGER NOT NULL DEFAULT 0,
    in_inner_circle     BOOLEAN NOT NULL DEFAULT FALSE,
    inner_circle_since  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lms_loyalty_inner_circle
    ON app_lms.lms_loyalty_accounts (org_id)
    WHERE in_inner_circle = TRUE;

CREATE TABLE IF NOT EXISTS app_lms.lms_loyalty_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL,
    delta           INTEGER NOT NULL,        -- positive=credit, negative=debit
    reason          TEXT NOT NULL,           -- 'order','referral','manual_credit','expiry','redemption'
    reference_id    UUID,                    -- e.g. order_id, referral_conversion_id
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_loyalty_tx_customer
    ON app_lms.lms_loyalty_transactions (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_lms.lms_referral_codes (
    code                TEXT PRIMARY KEY,
    org_id              UUID NOT NULL,
    owner_customer_id   UUID NOT NULL,
    reward_giver        NUMERIC(8,2),         -- e.g. 150 (rupees)
    reward_receiver     NUMERIC(8,2),
    uses_count          INTEGER NOT NULL DEFAULT 0,
    max_uses            INTEGER,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_referral_owner
    ON app_lms.lms_referral_codes (owner_customer_id);

CREATE TABLE IF NOT EXISTS app_lms.lms_referral_conversions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                TEXT NOT NULL REFERENCES app_lms.lms_referral_codes(code),
    new_customer_id     UUID NOT NULL,
    first_order_id      UUID NOT NULL,
    reward_status       TEXT NOT NULL CHECK (reward_status IN ('pending','granted','rejected')),
    rejection_reason    TEXT,
    granted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── §2.6 · Journeys + Journey Runs ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_journeys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    name            TEXT NOT NULL,
    trigger_event   TEXT NOT NULL,            -- 'first_delivery','sku_replenish_due','festival_T-14', etc.
    dsl             JSONB NOT NULL,           -- step graph
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, name, version)
);

CREATE TABLE IF NOT EXISTS app_lms.lms_journey_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id      UUID NOT NULL REFERENCES app_lms.lms_journeys(id),
    customer_id     UUID NOT NULL,
    current_state   TEXT NOT NULL,
    state_data      JSONB,
    next_action_at  TIMESTAMPTZ,              -- scheduler picks runs where this <= now()
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    exit_reason     TEXT
);

CREATE INDEX IF NOT EXISTS idx_lms_journey_runs_due
    ON app_lms.lms_journey_runs (next_action_at)
    WHERE completed_at IS NULL AND next_action_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lms_journey_runs_customer
    ON app_lms.lms_journey_runs (customer_id, started_at DESC);

-- ─── §2.6 · Touchpoints + Attribution ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_touchpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL,
    source          TEXT NOT NULL,        -- e.g. 'ctwa', 'google_organic', 'direct', 'email'
    medium          TEXT,                  -- e.g. 'cpc', 'organic', 'social'
    campaign        TEXT,
    content         TEXT,
    url             TEXT,
    device          TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lms_touchpoints_customer
    ON app_lms.lms_touchpoints (customer_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS app_lms.lms_attribution_assignments (
    order_id        UUID NOT NULL,        -- MySQL orders.id
    model           TEXT NOT NULL CHECK (model IN ('first_touch','last_touch','position_based','linear')),
    source          TEXT NOT NULL,
    weight          NUMERIC(5,4) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    PRIMARY KEY (order_id, model, source)
);

-- ─── Insights Feed (AI-flagged actions for Today screen) ────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_insights_feed (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    kind            TEXT NOT NULL,        -- 'replenishment_due','churn_risk_spike','opportunity','anomaly'
    title           TEXT NOT NULL,
    body            TEXT,
    cta_action      JSONB,                 -- e.g. {"type":"start_winback","segment_id":"..."}
    priority        SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    state           TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
                        'pending','approved','snoozed','dismissed','expired'
                    )),
    snooze_until    TIMESTAMPTZ,
    actioned_by_user_id UUID,
    actioned_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_insights_org_state
    ON app_lms.lms_insights_feed (org_id, state, priority, created_at DESC);

-- ─── §7.1 · Routing Audit (every WhatsApp outbound number-routing decision) ──

CREATE TABLE IF NOT EXISTS app_lms.lms_routing_audit (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL,
    campaign_message_id     UUID,                 -- null for non-campaign sends
    purpose                 TEXT NOT NULL,        -- txn_* or mkt_*
    picked_number           TEXT NOT NULL,        -- '1' or '2'
    integrated_number_id    UUID,                 -- public.integrated_numbers.id
    rejected                BOOLEAN NOT NULL DEFAULT FALSE,
    rejection_reason        TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_routing_audit_org_created
    ON app_lms.lms_routing_audit (org_id, created_at DESC);

-- ─── §7.6 · Number Quality Events ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_number_quality_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integrated_number_id    UUID NOT NULL,
    old_rating              TEXT,            -- 'GREEN' | 'YELLOW' | 'RED' | NULL
    new_rating              TEXT NOT NULL,
    detected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_event               JSONB
);

CREATE INDEX IF NOT EXISTS idx_lms_quality_events_number_time
    ON app_lms.lms_number_quality_events (integrated_number_id, detected_at DESC);

-- ─── Unified Customer mapping (spec §14 Q5 identity unification) ────────────
-- Materialised refresh nightly. Joins WACRM contacts.phone ↔ backend customers.phone.
-- Backend customers table is in MySQL; we cache (customer_id, phone) here so LMS
-- can reason about "customer" without per-request cross-DB joins.

CREATE TABLE IF NOT EXISTS app_lms.lms_unified_customers (
    customer_id     UUID PRIMARY KEY,
    org_id          UUID NOT NULL,
    contact_id      UUID,            -- public.contacts.id (Supabase)
    backend_user_id BIGINT,          -- MySQL customers.id (number per backend schema)
    phone           TEXT NOT NULL,
    email           TEXT,
    name            TEXT,
    refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_lms_unified_phone
    ON app_lms.lms_unified_customers (phone);

CREATE INDEX IF NOT EXISTS idx_lms_unified_backend_user
    ON app_lms.lms_unified_customers (backend_user_id)
    WHERE backend_user_id IS NOT NULL;

-- ============================================================================
-- Migration complete.
--
-- Verify:
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'app_lms'
--    ORDER BY table_name;
--
-- Expected 22 tables:
--   lms_attribution_assignments
--   lms_campaign_contents
--   lms_campaign_messages
--   lms_campaigns
--   lms_consent_records
--   lms_customer_tags
--   lms_health_scores
--   lms_insights_feed
--   lms_journey_runs
--   lms_journeys
--   lms_leads
--   lms_loyalty_accounts
--   lms_loyalty_transactions
--   lms_number_quality_events
--   lms_referral_codes
--   lms_referral_conversions
--   lms_rfm_scores
--   lms_routing_audit
--   lms_segment_memberships
--   lms_segments
--   lms_tags
--   lms_touchpoints
--   lms_unified_customers
-- ============================================================================

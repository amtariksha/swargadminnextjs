-- ============================================================================
-- Swarg LMS — Phase 2 prep · Migration 005
--
-- Three concerns in one migration (they all derive from the same owner ask:
-- "I want clear per-conversation cost reporting + I have 2 years of
-- archived conversations to mine + I'll curate 50 FAQ pairs"):
--
--   1. lms_agent_runs          — one row per agent invocation, drives the
--                                /lms/agents/cost dashboard. Populated by
--                                /api/agent-force/webhook on
--                                agent_run.completed events.
--
--   2. lms_archived_conversations / lms_archived_messages
--                              — the 2-year WhatsApp dataset lands here.
--                                Mirrors public.conversations/messages but
--                                separated so a recovery / re-ingest never
--                                touches live data.
--
--   3. lms_faq_candidates / lms_faq_approved
--                              — FAQ workflow: mined candidates go through
--                                a review queue before becoming live answers.
--                                approved rows have EN + KN + HI columns per
--                                cross-cutting decision §5.1.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

SET search_path = app_lms, public;

-- ─── 1 · Agent run cost + latency tracking ───────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_agent_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL,
    agent_slug          TEXT NOT NULL,
    session_id          TEXT NOT NULL,
    customer_id         UUID,
    conversation_id     UUID,
    input_tokens        INTEGER,
    output_tokens       INTEGER,
    cost_usd            NUMERIC(10, 6),       -- 6 decimals → tracks fractions of a cent
    latency_ms          INTEGER,
    result_summary      TEXT,                 -- first 200 chars of agent output, for at-a-glance
    raw_result          JSONB,                -- full payload for debugging
    succeeded           BOOLEAN NOT NULL DEFAULT TRUE,
    error_message       TEXT,
    request_id          TEXT,                 -- X-Agent-Force-Request-Id for dedupe
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_agent_runs_org_created
    ON app_lms.lms_agent_runs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lms_agent_runs_agent_created
    ON app_lms.lms_agent_runs (org_id, agent_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lms_agent_runs_conversation
    ON app_lms.lms_agent_runs (conversation_id)
    WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lms_agent_runs_customer
    ON app_lms.lms_agent_runs (customer_id)
    WHERE customer_id IS NOT NULL;

-- Idempotency: chatagent may retry on network errors. The unique index on
-- request_id means a re-post of the same agent_run.completed event becomes
-- a no-op rather than duplicating cost rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lms_agent_runs_request
    ON app_lms.lms_agent_runs (request_id)
    WHERE request_id IS NOT NULL;

COMMENT ON TABLE app_lms.lms_agent_runs IS
    'Per-invocation rollup. Populated by /api/agent-force/webhook.';

-- ─── 2 · Conversation archive ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_archived_conversations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL,
    customer_id         UUID,                 -- matched to public.contacts on ingest, may be null
    customer_phone      TEXT NOT NULL,
    customer_name       TEXT,
    started_at          TIMESTAMPTZ,          -- timestamp of first message in archive
    ended_at            TIMESTAMPTZ,          -- timestamp of last message
    message_count       INTEGER NOT NULL DEFAULT 0,
    intent_tags         TEXT[],               -- mined later: 'complaint','sales_enquiry','refund_request',...
    sentiment_summary   TEXT,                 -- 'positive'|'neutral'|'negative'|'mixed'
    source              TEXT NOT NULL CHECK (source IN (
                            'whatsapp_export','supabase_dump','manual_paste'
                        )),
    source_file         TEXT,                 -- original filename for traceability
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Mining flags so we don't re-process the same conversation repeatedly.
    mined_for_faq       BOOLEAN NOT NULL DEFAULT FALSE,
    mined_for_sentiment BOOLEAN NOT NULL DEFAULT FALSE,
    mined_for_intent    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_lms_archived_conv_phone
    ON app_lms.lms_archived_conversations (customer_phone);

CREATE INDEX IF NOT EXISTS idx_lms_archived_conv_org_started
    ON app_lms.lms_archived_conversations (org_id, started_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lms_archived_conv_mining_queue
    ON app_lms.lms_archived_conversations (org_id, mined_for_faq, mined_for_sentiment, mined_for_intent)
    WHERE NOT (mined_for_faq AND mined_for_sentiment AND mined_for_intent);

CREATE TABLE IF NOT EXISTS app_lms.lms_archived_messages (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    archived_conversation_id    UUID NOT NULL REFERENCES app_lms.lms_archived_conversations(id) ON DELETE CASCADE,
    direction                   TEXT NOT NULL CHECK (direction IN ('in','out','system')),
    sender                      TEXT,                  -- raw sender label from export ('+91...' or 'Swarg Support')
    body                        TEXT,
    content_type                TEXT NOT NULL DEFAULT 'text',
    media_url                   TEXT,
    media_type                  TEXT,
    sent_at                     TIMESTAMPTZ NOT NULL,
    sequence_in_conversation    INTEGER NOT NULL        -- preserves ordering when timestamps tie
);

CREATE INDEX IF NOT EXISTS idx_lms_archived_msg_conv
    ON app_lms.lms_archived_messages (archived_conversation_id, sequence_in_conversation);

CREATE INDEX IF NOT EXISTS idx_lms_archived_msg_sent_at
    ON app_lms.lms_archived_messages (sent_at);

-- ─── 3 · FAQ workflow ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_lms.lms_faq_candidates (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                      UUID NOT NULL,
    question                    TEXT NOT NULL,
    suggested_answer            TEXT,
    source_conversation_id      UUID REFERENCES app_lms.lms_archived_conversations(id),
    source_message_ids          UUID[],                 -- which messages prompted this Q
    confidence                  NUMERIC(3, 2),          -- 0.00 - 1.00 from mining agent
    product_sku_tags            TEXT[],                 -- best-guess SKU associations
    status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                                    'pending','approved','rejected','duplicate'
                                )),
    reviewed_by_user_id         UUID,
    reviewed_at                 TIMESTAMPTZ,
    rejection_reason            TEXT,
    promoted_to_faq_id          UUID,                   -- → lms_faq_approved.id when approved
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_faq_candidates_org_status
    ON app_lms.lms_faq_candidates (org_id, status, confidence DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS app_lms.lms_faq_approved (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL,
    question            TEXT NOT NULL,
    answer_en           TEXT NOT NULL,
    answer_kn           TEXT,                           -- Kannada
    answer_hi           TEXT,                           -- Hindi
    product_sku_tags    TEXT[],
    source              TEXT NOT NULL CHECK (source IN ('curated','mined')),
    approved_by_user_id UUID,
    -- Embedding column reserved for pgvector — set type AFTER extension is enabled.
    -- For now we store raw vector as JSON; will MIGRATE to vector(768) when
    -- vector extension is confirmed in Supabase project.
    embedding_json      JSONB,
    times_used          INTEGER NOT NULL DEFAULT 0,
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_faq_approved_org
    ON app_lms.lms_faq_approved (org_id);

CREATE INDEX IF NOT EXISTS idx_lms_faq_approved_usage
    ON app_lms.lms_faq_approved (org_id, times_used DESC);

-- ============================================================================
-- Verify after running:
--
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'app_lms'
--      AND table_name IN (
--        'lms_agent_runs','lms_archived_conversations','lms_archived_messages',
--        'lms_faq_candidates','lms_faq_approved'
--      );
--
-- Expected 5 rows.
-- ============================================================================

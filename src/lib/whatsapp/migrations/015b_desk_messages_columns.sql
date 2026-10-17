-- ============================================================================
-- Swarg Desk - Migration 015b · three nullable columns on public.messages
--
--   ticket_id        which desk ticket the message belongs to
--   sent_by_user_id  which exec sent an outbound message from the panel
--   sent_by_name     that exec's display name at send time
--
-- Nullable, no default, no foreign key. Existing rows keep NULL. Desk never
-- adds these columns to an existing insert payload; it writes them with
-- UPDATEs after the row exists, so application code deployed before this file
-- is applied cannot break a webhook insert or a send.
--
-- HOW TO APPLY (operator)
--   Supabase SQL editor, project reyrthufoezeqymzwaer, AFTER 015a.
--   TWO parts, pasted one at a time, in order. No BEGIN/COMMIT, no
--   CONCURRENTLY (the editor wraps each paste in one transaction).
--   Run outside 05:00-09:00 IST. Immediately before Part 1, check that
--   nothing is holding a long transaction open (expect zero rows):
--
--     SELECT pid, state, now() - xact_start AS age, left(query, 80) AS query
--       FROM pg_stat_activity
--      WHERE xact_start < now() - interval '30 seconds' AND state <> 'idle';
--
--   Idempotent. Afterwards run 015_verify.sql.
--
-- Never edit this file after it has been applied. Fix forward with a new
-- numbered file.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 of 2 - three nullable columns on public.messages.  Paste on its own.
--
-- ADD COLUMN without a default is a catalogue-only change: no table rewrite.
-- It needs an ACCESS EXCLUSIVE lock for an instant; lock_timeout makes it fail
-- fast (55P03) instead of queueing behind a long transaction and stalling
-- every webhook insert behind it. On 55P03 nothing changed: paste again.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS ticket_id        UUID,
    ADD COLUMN IF NOT EXISTS sent_by_user_id  TEXT,
    ADD COLUMN IF NOT EXISTS sent_by_name     TEXT;

COMMENT ON COLUMN public.messages.ticket_id IS
    'Desk: desk_tickets.id this message belongs to. No foreign key by design. Written only by post-insert UPDATEs in lib/desk, never by an insert payload.';
COMMENT ON COLUMN public.messages.sent_by_user_id IS
    'Desk: backend user id (text) of the exec who sent this outbound message from the panel. NULL for phone-app, API, template and broadcast sends.';
COMMENT ON COLUMN public.messages.sent_by_name IS
    'Desk: display name of sent_by_user_id at send time.';

RESET lock_timeout;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 of 2 - two partial indexes on public.messages.  Paste on its own.
--
-- Plain CREATE INDEX: takes a ShareLock that blocks writes to messages while
-- it builds. The table had 46,892 rows on 2026-10-05, so each build is well
-- under a second. Re-check the row count with pre-flight A8 before pasting.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

-- The orphan sweep: inbound messages that no ticket has claimed, oldest first.
-- The tick must filter with exactly direction = 'inbound' AND ticket_id IS NULL
-- (plus its created_at bounds) for the planner to use this index.
CREATE INDEX IF NOT EXISTS idx_messages_inbound_unticketed
    ON public.messages (created_at)
    WHERE direction = 'inbound' AND ticket_id IS NULL;

-- Messages of one ticket in time order: deriveTicketClock and the ticket thread.
CREATE INDEX IF NOT EXISTS idx_messages_ticket
    ON public.messages (ticket_id, created_at)
    WHERE ticket_id IS NOT NULL;

RESET lock_timeout;

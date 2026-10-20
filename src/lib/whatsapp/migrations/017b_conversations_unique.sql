-- ============================================================================
-- Swarg WhatsApp - Migration 017b · merge duplicate conversations, then
--                  UNIQUE (contact_id, integrated_number)
--
-- Why: one conversation per (contact, business number) is what the inbox and
-- Desk assume, but nothing enforced it, so a race between two near-simultaneous
-- first messages (or an old .single() lookup) created duplicate rows. This file
-- merges the duplicates into the oldest row and then creates the unique index
-- uq_conversations_contact_number. Once the index exists, a conversation insert
-- that loses the race fails with 23505; the P1d admin code handles that by
-- re-reading the winner's row (src/lib/whatsapp/conversation-lookup.ts).
--
-- Applied ONLY AFTER the P1d admin code is live in production (R-D3). With the
-- index in place and the old code running, two near-simultaneous first
-- messages would lose one message instead of creating a duplicate row.
--
-- DESTRUCTIVE: Part 2 deletes duplicate conversation rows after moving
-- everything that points at them (messages, reminders, payments, ctwa_logs,
-- lms_agent_runs, desk_tickets) to the surviving row. Extra unresolved Desk
-- tickets of a merged set are resolved as 'duplicate' of the oldest one.
-- Assignments on loser rows are not carried over (possible only since 017a).
--
-- HOW TO APPLY (operator)
--   Supabase SQL editor, project reyrthufoezeqymzwaer. Run outside 05:00-09:00
--   and 22:25-23:25 IST. Paste each part on its own, in this order:
--     1. Part 1a (read-only): how many rows the merge will remove.
--     2. Part 1b (read-only): every duplicate row and what it carries.
--     3. Part 1c (read-only): every table with a conversation_id column. It
--        must list exactly the six tables Part 2 re-points.
--     4. Review Part 1b with the owner of the inbox.
--     5. Part 2 (destructive, ONE paste): merge + unique index.
--     6. Part 1a again: expect 0, 0.
--     7. 017_verify.sql: every row OK.
--   No BEGIN/COMMIT (the editor wraps each paste in one transaction). If
--   detection returned nothing, Part 2 is still the right paste: its merge
--   steps are no-ops and it creates the index.
--
-- Never edit this file after it has been applied. Fix forward with a new file.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1a (read-only) - how many rows the merge will remove.  Paste on its own.
-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1a (read-only): how many rows the merge will remove. Expect a small number.
SELECT count(*) FILTER (WHERE rn > 1)                AS duplicate_rows,
       count(DISTINCT keep_id) FILTER (WHERE rn > 1) AS groups
  FROM (
        SELECT id,
               first_value(id) OVER w AS keep_id,
               row_number()    OVER w AS rn
          FROM public.conversations
         WHERE contact_id IS NOT NULL
           AND integrated_number IS NOT NULL
        WINDOW w AS (PARTITION BY contact_id, integrated_number ORDER BY created_at ASC, id ASC)
       ) r;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1b (read-only) - the duplicate rows, for review.  Paste on its own.
-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1b (read-only): every conversation that shares its (contact, number) with
-- another row, and what each one carries. survivor = the row that stays.
-- (a-schema.md section 6.1, unchanged)
WITH dup AS (
    SELECT contact_id, integrated_number
      FROM public.conversations
     WHERE contact_id IS NOT NULL
       AND integrated_number IS NOT NULL
     GROUP BY contact_id, integrated_number
    HAVING count(*) > 1
)
SELECT c.contact_id,
       c.integrated_number,
       c.id AS conversation_id,
       (row_number() OVER (PARTITION BY c.contact_id, c.integrated_number
                           ORDER BY c.created_at ASC, c.id ASC) = 1)          AS survivor,
       c.created_at,
       c.status,
       c.unread_count,
       c.assigned_to,
       c.last_message_time,
       c.last_incoming_timestamp,
       (SELECT count(*) FROM public.messages m WHERE m.conversation_id = c.id)     AS messages,
       (SELECT count(*) FROM public.desk_tickets t WHERE t.conversation_id = c.id) AS tickets,
       (SELECT count(*) FROM public.desk_tickets t
         WHERE t.conversation_id = c.id AND t.status <> 'resolved')                AS unresolved_tickets
  FROM public.conversations c
  JOIN dup d ON d.contact_id = c.contact_id
            AND d.integrated_number = c.integrated_number
 ORDER BY c.contact_id, c.integrated_number, c.created_at, c.id;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1c (read-only) - tables that point at conversations.  Paste on its own.
-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1c (read-only): every column named conversation_id. Expect exactly:
-- app_lms.lms_agent_runs, public.ctwa_logs, public.desk_tickets, public.messages,
-- public.payments, public.reminders. Any other table: STOP, Part 2 must re-point it too.
SELECT table_schema, table_name
  FROM information_schema.columns
 WHERE column_name = 'conversation_id'
   AND table_schema IN ('public', 'app_lms')
   AND table_name NOT LIKE 'v\_%'
 ORDER BY 1, 2;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 - DESTRUCTIVE: merge the duplicates, then the unique index.
-- Paste as ONE block, only after the owner reviewed Part 1b.
-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 - DESTRUCTIVE. Paste as ONE block: the editor's transaction makes it
-- all-or-nothing. Webhooks and the Desk tick wait (about a second) on the locks
-- and then proceed; reads are not blocked.
SET lock_timeout = '5s';

LOCK TABLE public.conversations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.messages, public.reminders, public.payments, public.ctwa_logs,
           public.desk_tickets, app_lms.lms_agent_runs IN SHARE ROW EXCLUSIVE MODE;

-- (1) Which row survives: the oldest of each (contact, number) pair.
CREATE TEMP TABLE _conv_merge ON COMMIT DROP AS
SELECT loser_id, survivor_id
  FROM (
        SELECT c.id AS loser_id,
               first_value(c.id) OVER (PARTITION BY c.contact_id, c.integrated_number
                                       ORDER BY c.created_at ASC, c.id ASC) AS survivor_id
          FROM public.conversations c
         WHERE c.contact_id IS NOT NULL
           AND c.integrated_number IS NOT NULL
       ) r
 WHERE loser_id <> survivor_id;

-- (2) Tickets: keep the oldest unresolved ticket of each merged set; resolve the
--     others as duplicates of it and hand their messages to it.
CREATE TEMP TABLE _ticket_merge ON COMMIT DROP AS
SELECT dup_ticket_id, kept_ticket_id
  FROM (
        SELECT t.id AS dup_ticket_id,
               first_value(t.id) OVER (PARTITION BY s.survivor_id
                                       ORDER BY t.opened_at ASC, t.id ASC) AS kept_ticket_id
          FROM public.desk_tickets t
          JOIN (SELECT loser_id AS conversation_id, survivor_id FROM _conv_merge
                UNION
                SELECT survivor_id, survivor_id FROM _conv_merge) s
            ON s.conversation_id = t.conversation_id
         WHERE t.status <> 'resolved'
       ) r
 WHERE dup_ticket_id <> kept_ticket_id;

UPDATE public.messages m
   SET ticket_id = tm.kept_ticket_id
  FROM _ticket_merge tm
 WHERE m.ticket_id = tm.dup_ticket_id;

INSERT INTO public.desk_ticket_events (ticket_id, type, from_status, to_status, actor_id, actor_name, data)
SELECT t.id, 'resolved', t.status, 'resolved', 'system', 'Desk engine',
       jsonb_build_object('resolution_code', 'duplicate',
                          'resolved_via', 'system',
                          'note', 'Conversation merged into an older duplicate (migration 017b)',
                          'lost_reason', NULL,
                          'action_id', NULL,
                          'duplicate_of_ticket_no', k.ticket_no)
  FROM public.desk_tickets t
  JOIN _ticket_merge tm ON tm.dup_ticket_id = t.id
  JOIN public.desk_tickets k ON k.id = tm.kept_ticket_id;

UPDATE public.desk_tickets t
   SET status                 = 'resolved',
       resolved_at            = now(),
       resolved_by            = NULL,
       resolved_by_name       = NULL,
       resolved_via           = 'system',
       resolution_code        = 'duplicate',
       resolution_note        = NULL,
       duplicate_of_ticket_id = tm.kept_ticket_id,
       follow_up_at           = NULL,
       hold_reason            = NULL,
       awaiting_reply_since   = NULL,
       first_resolved_at      = COALESCE(t.first_resolved_at, now()),
       first_resolved_code    = COALESCE(t.first_resolved_code, 'duplicate')
  FROM _ticket_merge tm
 WHERE t.id = tm.dup_ticket_id;

-- (3) Re-point every child row to the survivor (list confirmed by Part 1c).
UPDATE public.messages        x SET conversation_id = cm.survivor_id FROM _conv_merge cm WHERE x.conversation_id = cm.loser_id;
UPDATE public.reminders       x SET conversation_id = cm.survivor_id FROM _conv_merge cm WHERE x.conversation_id = cm.loser_id;
UPDATE public.payments        x SET conversation_id = cm.survivor_id FROM _conv_merge cm WHERE x.conversation_id = cm.loser_id;
UPDATE public.ctwa_logs       x SET conversation_id = cm.survivor_id FROM _conv_merge cm WHERE x.conversation_id = cm.loser_id;
UPDATE app_lms.lms_agent_runs x SET conversation_id = cm.survivor_id FROM _conv_merge cm WHERE x.conversation_id = cm.loser_id;
UPDATE public.desk_tickets    x SET conversation_id = cm.survivor_id FROM _conv_merge cm WHERE x.conversation_id = cm.loser_id;

-- (4) Fold the inbox summary of the set into the survivor.
WITH members AS (
    SELECT survivor_id, loser_id AS id FROM _conv_merge
    UNION
    SELECT DISTINCT survivor_id, survivor_id FROM _conv_merge
), grp AS (
    SELECT g.survivor_id,
           bool_or(c.status = 'open')        AS any_open,
           sum(COALESCE(c.unread_count, 0))::int AS unread_sum,
           max(c.last_incoming_timestamp)    AS max_incoming,
           max(c.last_message_time)          AS max_message_time,
           max(c.ctwa_clid)                  AS any_ctwa_clid,
           (array_agg(c.last_message ORDER BY c.last_message_time DESC NULLS LAST))[1] AS newest_preview
      FROM members g
      JOIN public.conversations c ON c.id = g.id
     GROUP BY g.survivor_id
)
UPDATE public.conversations s
   SET status                  = CASE WHEN grp.any_open THEN 'open' ELSE s.status END,
       unread_count            = grp.unread_sum,
       last_incoming_timestamp = grp.max_incoming,
       last_message_time       = grp.max_message_time,
       source                  = CASE WHEN s.ctwa_clid IS NULL AND grp.any_ctwa_clid IS NOT NULL
                                      THEN 'ctwa' ELSE s.source END,
       ctwa_clid               = COALESCE(s.ctwa_clid, grp.any_ctwa_clid),
       last_message            = COALESCE(
                                    (SELECT COALESCE(NULLIF(m.body, ''), '[media]')
                                       FROM public.messages m
                                      WHERE m.conversation_id = s.id
                                      ORDER BY m.created_at DESC
                                      LIMIT 1),
                                    grp.newest_preview,
                                    s.last_message)
  FROM grp
 WHERE s.id = grp.survivor_id;

-- (5) Nothing references the losers now; delete them.
DELETE FROM public.conversations c
 USING _conv_merge cm
 WHERE c.id = cm.loser_id;

-- (6) The constraint, in the same transaction as the clean-up.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_contact_number
    ON public.conversations (contact_id, integrated_number);

RESET lock_timeout;

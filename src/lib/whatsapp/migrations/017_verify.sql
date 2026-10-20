-- =============================================================================
-- 017_verify.sql - did 017a, 017b and 017c land, and is webhook_debug locked down?
-- =============================================================================
--
-- Read-only. One statement, one result grid. Safe to run at any time, before,
-- between or after the parts; it never errors on a missing part.
--
-- Every row should read OK. Anything else names the part to paste. Before
-- 017b the two 017b rows read PENDING (or a group count), which is expected
-- until step 6 of the apply order (017b runs only after the P1d code is live).
-- =============================================================================
WITH
cols AS (
    SELECT c.relname AS tbl, a.attname AS col, format_type(a.atttypid, a.atttypmod) AS typ
      FROM pg_attribute a
      JOIN pg_class c     ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE a.attnum > 0 AND NOT a.attisdropped
       AND (c.relname, a.attname) IN (
            ('conversations', 'assigned_to'), ('reminders', 'user_id'),
            ('webhook_debug', 'journal_status'), ('webhook_debug', 'outcome'),
            ('webhook_debug', 'auth_result'), ('webhook_debug', 'processed_at'),
            ('webhook_debug', 'replay_count'), ('webhook_debug', 'last_replay_at'))
),
uq AS (
    SELECT i.indisunique AS is_unique, pg_get_indexdef(i.indexrelid) AS def
      FROM pg_index i
      JOIN pg_class ic    ON ic.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = ic.relnamespace AND n.nspname = 'public'
     WHERE ic.relname = 'uq_conversations_contact_number'
),
dups AS (
    SELECT count(*) AS groups
      FROM (SELECT 1 FROM public.conversations
             WHERE contact_id IS NOT NULL AND integrated_number IS NOT NULL
             GROUP BY contact_id, integrated_number HAVING count(*) > 1) g
),
wd AS (
    SELECT c.oid, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relname = 'webhook_debug' AND c.relkind = 'r'
),
jidx AS (
    SELECT count(*) AS n
      FROM pg_class ic
      JOIN pg_namespace n ON n.oid = ic.relnamespace AND n.nspname = 'public'
     WHERE ic.relname = 'idx_webhook_debug_journal_pending'
)
SELECT '017a conversations.assigned_to is text' AS check_item,
       CASE WHEN (SELECT typ FROM cols WHERE tbl = 'conversations' AND col = 'assigned_to') = 'text'
            THEN 'OK' ELSE 'MISSING: paste 017a' END AS status
UNION ALL
SELECT '017a reminders.user_id is text',
       CASE WHEN (SELECT typ FROM cols WHERE tbl = 'reminders' AND col = 'user_id') = 'text'
            THEN 'OK' ELSE 'MISSING: paste 017a' END
UNION ALL
SELECT '017c journal columns (6)',
       CASE WHEN (SELECT count(*) FROM cols WHERE tbl = 'webhook_debug') = 6
            THEN 'OK' ELSE 'MISSING: paste 017c Part 1' END
UNION ALL
SELECT '017c idx_webhook_debug_journal_pending',
       CASE WHEN (SELECT n FROM jidx) = 1 THEN 'OK' ELSE 'MISSING: paste 017c Part 1' END
UNION ALL
SELECT '017c webhook_debug RLS enabled',
       CASE WHEN (SELECT relrowsecurity FROM wd) THEN 'OK' ELSE 'MISSING: paste 017c Part 2' END
UNION ALL
SELECT '017c anon/authenticated have no privilege on webhook_debug',
       CASE WHEN NOT has_table_privilege('anon', (SELECT oid FROM wd), 'SELECT, INSERT, UPDATE, DELETE')
             AND NOT has_table_privilege('authenticated', (SELECT oid FROM wd), 'SELECT, INSERT, UPDATE, DELETE')
            THEN 'OK' ELSE 'OPEN: paste 017c Part 2' END
UNION ALL
SELECT '017c service_role can write webhook_debug',
       CASE WHEN has_table_privilege('service_role', (SELECT oid FROM wd), 'INSERT')
             AND has_table_privilege('service_role', (SELECT oid FROM wd), 'UPDATE')
            THEN 'OK' ELSE 'MISSING: paste 017c Part 2' END
UNION ALL
SELECT '017b uq_conversations_contact_number',
       CASE WHEN EXISTS (SELECT 1 FROM uq WHERE is_unique AND def LIKE '%(contact_id, integrated_number)%')
            THEN 'OK' ELSE 'PENDING: 017b Part 2, only after the P1d code is live' END
UNION ALL
SELECT '017b duplicate (contact, number) groups',
       CASE WHEN (SELECT groups FROM dups) = 0 THEN 'OK'
            ELSE (SELECT groups FROM dups)::text || ' groups: run 017b' END;

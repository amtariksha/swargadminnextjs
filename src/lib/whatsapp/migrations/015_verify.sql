-- =============================================================================
-- 015_verify.sql - did every part of 015a and 015b land, and is it locked down?
-- =============================================================================
--
-- Read-only. One statement, one result grid. Safe to run at any time, before,
-- between or after the parts; it never errors on a missing desk table.
--
-- 015a is pasted as THREE parts and 015b as TWO, so it is easy to run some and
-- think you ran all. Every row below should read OK (the "flags" row is
-- informational). Anything else names the part to paste again; every part is
-- idempotent.
-- =============================================================================
WITH
desk_tables (tbl) AS (
    VALUES ('desk_categories'), ('desk_tickets'), ('desk_ticket_events'),
           ('desk_ticket_actions'), ('desk_action_items')
),
present AS (
    SELECT t.tbl, c.oid, c.relrowsecurity
      FROM desk_tables t
      JOIN pg_class c      ON c.relname = t.tbl AND c.relkind = 'r'
      JOIN pg_namespace n  ON n.oid = c.relnamespace AND n.nspname = 'public'
),
per_table AS (
    SELECT t.tbl,
           p.oid,
           p.relrowsecurity                                                       AS rls,
           (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid = p.oid)        AS policies,
           has_table_privilege('anon', p.oid,
               'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')   AS anon_any,
           has_table_privilege('authenticated', p.oid,
               'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')   AS auth_any,
           (has_table_privilege('service_role', p.oid, 'SELECT')
            AND has_table_privilege('service_role', p.oid, 'INSERT')
            AND has_table_privilege('service_role', p.oid, 'UPDATE')
            AND has_table_privilege('service_role', p.oid, 'DELETE'))             AS service_all
      FROM desk_tables t
      LEFT JOIN present p ON p.tbl = t.tbl
),
desk_seqs AS (
    -- identity sequences owned by a desk table
    SELECT s.oid, s.relname
      FROM pg_class s
      JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = s.oid
                      AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('i', 'a')
      JOIN present p   ON p.oid = d.refobjid
     WHERE s.relkind = 'S'
),
expected_idx (idx) AS (
    VALUES ('uq_desk_tickets_open_conversation'), ('idx_desk_tickets_conversation_opened'),
           ('idx_desk_tickets_open_queue'), ('idx_desk_tickets_open_assignee'),
           ('idx_desk_tickets_opened'), ('idx_desk_tickets_resolved'),
           ('idx_desk_tickets_phone_opened'), ('idx_desk_tickets_user_opened'),
           ('idx_desk_tickets_contact'),
           ('idx_desk_ticket_events_ticket_created'), ('idx_desk_ticket_events_type_created'),
           ('idx_desk_ticket_actions_ticket_created'), ('idx_desk_ticket_actions_type_created'),
           ('uq_desk_ticket_actions_money_ref'),
           ('idx_desk_action_items_status_due'), ('idx_desk_action_items_ticket')
),
expected_fk (conname, deltype) AS (
    VALUES ('desk_tickets_conversation_fk', 'n'), ('desk_tickets_contact_fk', 'n'),
           ('desk_ticket_events_ticket_fk', 'r'), ('desk_ticket_actions_ticket_fk', 'r'),
           ('desk_action_items_ticket_fk', 'n')
),
desk_keys (key) AS (
    VALUES ('desk_engine_enabled'), ('desk_inline_hooks'), ('desk_ui_enabled'),
           ('desk_cutover_redirect'), ('desk_ack_suppress'), ('desk_go_live_at'),
           ('desk_stats_from'), ('desk_reopen_window_hours'), ('desk_idle_close_hours'),
           ('desk_ack_autoclose_hours'), ('desk_reply_alert_mins'), ('desk_number_queues'),
           ('desk_business_hours'), ('desk_credit_max_agent'), ('desk_last_tick_at'),
           ('desk_last_tick_stats')
),
category_rows AS (
    -- counted through query_to_xml so this script does not fail to parse when
    -- the table is absent
    SELECT CASE WHEN to_regclass('public.desk_categories') IS NULL THEN NULL
                ELSE (xpath('/row/c/text()',
                            query_to_xml('SELECT count(*) AS c FROM public.desk_categories',
                                         false, true, '')))[1]::text::int
           END AS n
),
report AS (
    SELECT 10 AS ord, 'table public.' || tbl AS step,
           CASE WHEN oid IS NULL THEN 'absent'
                ELSE 'rls=' || rls || ' policies=' || policies || ' anon=' || anon_any
                     || ' authenticated=' || auth_any || ' service_role=' || service_all
           END AS got,
           CASE WHEN oid IS NULL THEN 'MISSING - paste 015a part 1'
                WHEN policies > 0 THEN 'POLICY FOUND - drop it; desk tables take no policies'
                WHEN rls AND NOT anon_any AND NOT auth_any AND service_all THEN 'OK'
                ELSE 'WRONG - paste 015a part 1 again'
           END AS status
      FROM per_table
    UNION ALL
    SELECT 20, 'service_role has BYPASSRLS',
           COALESCE((SELECT rolbypassrls::text FROM pg_roles WHERE rolname = 'service_role'), 'role absent'),
           CASE WHEN (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role')
                THEN 'OK' ELSE 'STOP - desk tables have no policies, service_role could not read them' END
    UNION ALL
    SELECT 30, 'identity sequences',
           count(*)::text || ' of 4, anon/authenticated=' ||
               count(*) FILTER (WHERE has_sequence_privilege('anon', oid, 'USAGE, SELECT, UPDATE')
                                   OR has_sequence_privilege('authenticated', oid, 'USAGE, SELECT, UPDATE'))::text
               || ', service_role=' ||
               count(*) FILTER (WHERE has_sequence_privilege('service_role', oid, 'USAGE'))::text,
           CASE WHEN count(*) = 4
                 AND count(*) FILTER (WHERE has_sequence_privilege('anon', oid, 'USAGE, SELECT, UPDATE')
                                         OR has_sequence_privilege('authenticated', oid, 'USAGE, SELECT, UPDATE')) = 0
                 AND count(*) FILTER (WHERE has_sequence_privilege('service_role', oid, 'USAGE')) = 4
                THEN 'OK' ELSE 'MISSING OR WRONG - paste 015a part 1' END
      FROM desk_seqs
    UNION ALL
    SELECT 40, 'app_db_app privileges on desk tables (expect 0)', count(*)::text,
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVOKE - the backend must not reach desk tables' END
      FROM pg_roles r CROSS JOIN present p
     WHERE r.rolname = 'app_db_app'
       AND has_table_privilege(r.oid, p.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    UNION ALL
    SELECT 50, 'desk_tickets CHECK constraints', count(*)::text || ' of 2',
           CASE WHEN count(*) = 2 THEN 'OK' ELSE 'MISSING - paste 015a part 1' END
      FROM pg_constraint
     WHERE contype = 'c'
       AND conname IN ('desk_tickets_status_check', 'desk_tickets_resolved_at_check')
    UNION ALL
    SELECT 60, 'foreign keys with the right delete rule', count(*)::text || ' of 5',
           CASE WHEN count(*) = 5 THEN 'OK' ELSE 'MISSING OR WRONG RULE - paste 015a part 1' END
      FROM expected_fk e
      JOIN pg_constraint c ON c.conname = e.conname AND c.contype = 'f' AND c.confdeltype = e.deltype
    UNION ALL
    SELECT 70, '015a part 2 - indexes', count(*)::text || ' of 16',
           CASE WHEN count(*) = 16 THEN 'OK' ELSE 'MISSING - paste 015a part 2' END
      FROM expected_idx e
      JOIN pg_indexes i ON i.schemaname = 'public' AND i.indexname = e.idx
    UNION ALL
    SELECT 80, 'one-unresolved-ticket index predicate',
           COALESCE((SELECT substring(indexdef FROM 'WHERE .*$') FROM pg_indexes
                      WHERE schemaname = 'public' AND indexname = 'uq_desk_tickets_open_conversation'), 'absent'),
           CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                              WHERE schemaname = 'public'
                                AND indexname = 'uq_desk_tickets_open_conversation'
                                AND indexdef LIKE 'CREATE UNIQUE INDEX%'
                                AND indexdef LIKE '%(status <> ''resolved''::text)')
                THEN 'OK' ELSE 'WRONG - must be UNIQUE ... WHERE status <> ''resolved''' END
    UNION ALL
    SELECT 90, '015a part 3 - categories seeded',
           COALESCE((SELECT n::text || ' rows (33 are seeded)' FROM category_rows), 'table absent'),
           CASE WHEN (SELECT n FROM category_rows) >= 33 THEN 'OK' ELSE 'MISSING - paste 015a part 3' END
    UNION ALL
    SELECT 100, '015a part 3 - settings seeded', count(s.key)::text || ' of 16',
           CASE WHEN count(s.key) = 16 THEN 'OK' ELSE 'MISSING - paste 015a part 3' END
      FROM desk_keys k
      LEFT JOIN (SELECT DISTINCT key FROM public.app_settings WHERE org_id IS NULL) s ON s.key = k.key
    UNION ALL
    SELECT 110, 'duplicate global desk settings (expect 0)', count(*)::text,
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'DUPLICATES - getDeskSettings would read all-off; delete the extras' END
      FROM (SELECT key FROM public.app_settings
             WHERE org_id IS NULL AND key LIKE 'desk\_%'
             GROUP BY key HAVING count(*) > 1) d
    UNION ALL
    SELECT 120, 'flags',
           COALESCE((SELECT string_agg(key || '=' || value, ' ' ORDER BY key) FROM public.app_settings
                      WHERE org_id IS NULL
                        AND key IN ('desk_engine_enabled', 'desk_inline_hooks',
                                    'desk_ui_enabled', 'desk_cutover_redirect')), 'absent'),
           'all four should be 0 until a unit''s operator steps say otherwise'
    UNION ALL
    SELECT 130, '015b part 1 - columns on public.messages', count(*)::text || ' of 3',
           CASE WHEN count(*) = 3 THEN 'OK' ELSE 'MISSING - paste 015b part 1' END
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages'
       AND column_name IN ('ticket_id', 'sent_by_user_id', 'sent_by_name')
    UNION ALL
    SELECT 140, '015b part 2 - indexes on public.messages', count(*)::text || ' of 2',
           CASE WHEN count(*) = 2 THEN 'OK' ELSE 'MISSING - paste 015b part 2' END
      FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'messages'
       AND indexname IN ('idx_messages_inbound_unticketed', 'idx_messages_ticket')
    UNION ALL
    SELECT 150, 'desk functions, views, triggers, realtime (expect 0)',
           ((SELECT count(*) FROM pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
              WHERE n.nspname = 'public' AND f.proname LIKE 'desk\_%')
          + (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') AND c.relname LIKE 'desk\_%')
          + (SELECT count(*) FROM pg_trigger t JOIN present p ON p.oid = t.tgrelid
              WHERE NOT t.tgisinternal)
          + (SELECT count(*) FROM pg_publication_tables
              WHERE schemaname = 'public' AND tablename LIKE 'desk\_%'))::text,
           CASE WHEN ((SELECT count(*) FROM pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
                        WHERE n.nspname = 'public' AND f.proname LIKE 'desk\_%')
                    + (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') AND c.relname LIKE 'desk\_%')
                    + (SELECT count(*) FROM pg_trigger t JOIN present p ON p.oid = t.tgrelid
                        WHERE NOT t.tgisinternal)
                    + (SELECT count(*) FROM pg_publication_tables
                        WHERE schemaname = 'public' AND tablename LIKE 'desk\_%')) = 0
                THEN 'OK' ELSE 'UNEXPECTED OBJECT - v1 allows none of these on desk data' END
)
SELECT step, got, status
  FROM report
 ORDER BY ord, step;

-- =============================================================================
-- 016_verify.sql - did every part of 016 land, and is it locked down?
-- =============================================================================
--
-- Read-only. One statement, one result grid. Safe to run at any time, before,
-- between or after the parts; it never errors on a missing table.
-- Every row should read OK; rows 70 and 80 are informational.
-- =============================================================================
WITH
present AS (
    SELECT c.oid, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relname = 'desk_contact_flags' AND c.relkind = 'r'
),
flags_table AS (
    SELECT p.oid,
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
      FROM (SELECT 1) one
      LEFT JOIN present p ON true
),
flags_seq AS (
    SELECT to_regclass('public.desk_contact_flags_id_seq') AS oid
),
report AS (
    SELECT 10 AS ord, 'table public.desk_contact_flags' AS step,
           CASE WHEN oid IS NULL THEN 'absent'
                ELSE 'rls=' || rls || ' policies=' || policies || ' anon=' || anon_any
                     || ' authenticated=' || auth_any || ' service_role=' || service_all
           END AS got,
           CASE WHEN oid IS NULL THEN 'MISSING - paste 016 part 1'
                WHEN policies > 0 THEN 'POLICY FOUND - drop it; desk tables take no policies'
                WHEN rls AND NOT anon_any AND NOT auth_any AND service_all THEN 'OK'
                ELSE 'WRONG - paste 016 part 1 again'
           END AS status
      FROM flags_table
    UNION ALL
    SELECT 20, 'columns of desk_contact_flags', count(*)::text || ' of 10',
           CASE WHEN count(*) = 10 THEN 'OK' ELSE 'MISSING - paste 016 part 1' END
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'desk_contact_flags'
       AND column_name IN ('id', 'phone', 'kind', 'label', 'added_by', 'added_by_name',
                           'added_at', 'removed_at', 'removed_by', 'removed_by_name')
    UNION ALL
    SELECT 30, 'identity sequence',
           CASE WHEN oid IS NULL THEN 'absent'
                ELSE 'anon/authenticated=' ||
                     (has_sequence_privilege('anon', oid, 'USAGE, SELECT, UPDATE')
                      OR has_sequence_privilege('authenticated', oid, 'USAGE, SELECT, UPDATE'))::text
                     || ' service_role=' || has_sequence_privilege('service_role', oid, 'USAGE')::text
           END,
           CASE WHEN oid IS NOT NULL
                 AND NOT has_sequence_privilege('anon', oid, 'USAGE, SELECT, UPDATE')
                 AND NOT has_sequence_privilege('authenticated', oid, 'USAGE, SELECT, UPDATE')
                 AND has_sequence_privilege('service_role', oid, 'USAGE')
                THEN 'OK' ELSE 'MISSING OR WRONG - paste 016 part 1' END
      FROM flags_seq
    UNION ALL
    SELECT 40, 'app_db_app privileges on desk_contact_flags (expect 0)', count(*)::text,
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVOKE - the backend must not reach desk tables' END
      FROM pg_roles r CROSS JOIN present p
     WHERE r.rolname = 'app_db_app'
       AND has_table_privilege(r.oid, p.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    UNION ALL
    SELECT 50, '016 part 2 - unique index on active phones',
           COALESCE((SELECT indexdef FROM pg_indexes
                      WHERE schemaname = 'public' AND indexname = 'uq_desk_contact_flags_phone_active'), 'absent'),
           CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                              WHERE schemaname = 'public'
                                AND indexname = 'uq_desk_contact_flags_phone_active'
                                AND indexdef LIKE 'CREATE UNIQUE INDEX%'
                                AND indexdef LIKE '%(phone)%'
                                AND indexdef LIKE '%WHERE (removed_at IS NULL)')
                THEN 'OK' ELSE 'MISSING OR WRONG - paste 016 part 2' END
    UNION ALL
    SELECT 60, '016 part 3 - desk_staff_phones seeded (global, once)',
           count(*)::text || ' row(s), value starts ' ||
               COALESCE(left(min(value), 12), '-'),
           CASE WHEN count(*) = 1 AND min(value) LIKE '[%' THEN 'OK'
                WHEN count(*) = 0 THEN 'MISSING - paste 016 part 3'
                ELSE 'DUPLICATES OR BAD VALUE - keep one row with a JSON array' END
      FROM public.app_settings
     WHERE key = 'desk_staff_phones' AND org_id IS NULL
    UNION ALL
    SELECT 70, 'staff phones stored (informational; the tick fills it)',
           COALESCE((SELECT CASE WHEN value LIKE '[%' THEN json_array_length(value::json)::text ELSE 'not a JSON array' END
                       FROM public.app_settings WHERE key = 'desk_staff_phones' AND org_id IS NULL LIMIT 1), 'absent'),
           '0 until a backend with P1e has ticked once'
    UNION ALL
    SELECT 80, 'anon/authenticated can read public.app_settings (informational, pre-existing)',
           CASE WHEN to_regclass('public.app_settings') IS NULL THEN 'absent'
                ELSE 'anon=' || has_table_privilege('anon', 'public.app_settings', 'SELECT')::text
                     || ' authenticated=' || has_table_privilege('authenticated', 'public.app_settings', 'SELECT')::text
                     || ' rls=' || (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.app_settings'::regclass)
                     || ' policies=' || (SELECT count(*)::text FROM pg_policy WHERE polrelid = 'public.app_settings'::regclass)
           END,
           'anon=true with rls=false (or with a policy) means the publishable key reads every row, desk_staff_phones included - tell the planner'
    UNION ALL
    SELECT 90, 'desk_contact_flags triggers, views, realtime (expect 0)',
           ((SELECT count(*) FROM pg_trigger t JOIN present p ON p.oid = t.tgrelid WHERE NOT t.tgisinternal)
          + (SELECT count(*) FROM pg_publication_tables
              WHERE schemaname = 'public' AND tablename = 'desk_contact_flags'))::text,
           CASE WHEN ((SELECT count(*) FROM pg_trigger t JOIN present p ON p.oid = t.tgrelid WHERE NOT t.tgisinternal)
                    + (SELECT count(*) FROM pg_publication_tables
                        WHERE schemaname = 'public' AND tablename = 'desk_contact_flags')) = 0
                THEN 'OK' ELSE 'UNEXPECTED OBJECT - v1 allows none of these on desk data' END
)
SELECT step, got, status
  FROM report
 ORDER BY ord, step;

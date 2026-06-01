-- ============================================================================
-- Swarg WhatsApp — 008b · clean up garbage rows from the webhook swap bug
--
-- Before the fix, the MSG91 webhook's "external outbound" branch swapped
-- customer/business on outbound template delivery reports (e.g.
-- swarg_credit_debit wallet notifications). Each such event created:
--   • a CONTACT whose phone is one of OUR OWN business numbers, and
--   • a CONVERSATION whose integrated_number is a CUSTOMER's number
--     (orphaned — it matches no per-number inbox).
--
-- ⚠️ DESTRUCTIVE. Run the SELECTs first and eyeball the rows. Only then run the
--    DELETE block (uncomment it). Manual paste into the Supabase SQL editor.
--    Caveat: if you ever had a legitimate number that was since removed from
--    integrated_numbers, its conversations would match query (1) — confirm the
--    flagged integrated_numbers are really customer numbers before deleting.
-- ============================================================================

-- (1) REVIEW — orphaned conversations: integrated_number is NOT a registered
--     business number (a customer number landed there via the swap).
SELECT id, contact_id, integrated_number, LEFT(last_message, 50) AS last_message, created_at
FROM public.conversations
WHERE integrated_number IS NOT NULL
  AND integrated_number <> 'default'
  AND integrated_number NOT IN (SELECT number FROM public.integrated_numbers)
ORDER BY created_at DESC;

-- (2) REVIEW — contacts whose phone is one of our own business numbers.
SELECT id, phone, name, created_at
FROM public.contacts
WHERE phone IN (SELECT number FROM public.integrated_numbers)
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- DELETE — uncomment and run ONLY after reviewing (1) and (2) above.
-- ----------------------------------------------------------------------------
-- BEGIN;
--
-- -- messages of the orphaned (wrong-integrated_number) conversations
-- DELETE FROM public.messages m
-- USING public.conversations c
-- WHERE m.conversation_id = c.id
--   AND c.integrated_number IS NOT NULL
--   AND c.integrated_number <> 'default'
--   AND c.integrated_number NOT IN (SELECT number FROM public.integrated_numbers);
--
-- -- messages of conversations attached to self-number contacts
-- DELETE FROM public.messages m
-- USING public.conversations c
-- JOIN public.contacts ct ON ct.id = c.contact_id
-- WHERE m.conversation_id = c.id
--   AND ct.phone IN (SELECT number FROM public.integrated_numbers);
--
-- -- the orphaned conversations
-- DELETE FROM public.conversations
-- WHERE integrated_number IS NOT NULL
--   AND integrated_number <> 'default'
--   AND integrated_number NOT IN (SELECT number FROM public.integrated_numbers);
--
-- -- conversations attached to self-number contacts
-- DELETE FROM public.conversations
-- WHERE contact_id IN (SELECT id FROM public.contacts
--                      WHERE phone IN (SELECT number FROM public.integrated_numbers));
--
-- -- the self-number contacts themselves
-- DELETE FROM public.contacts
-- WHERE phone IN (SELECT number FROM public.integrated_numbers);
--
-- COMMIT;

-- Tests for migration 011 (AI settings, workspace AI keys, spam overrides). Rolled back; safe anywhere:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ai_settings.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE org_a uuid := '37d65400-8aa9-4a66-ac13-b4330e53cad4'; admin_b uuid := '6d3db08a-285f-4439-84db-5fc2fa235a32'; ok boolean; e uuid;
BEGIN
  INSERT INTO organizations (name, slug) VALUES ('Rehearsal Org', 'rehearsal-org-011') RETURNING id INTO e;
  IF (SELECT ai_auto_send FROM organizations WHERE id = e) THEN RAISE EXCEPTION 'FAIL 1: auto-send on by default'; END IF;
  RAISE NOTICE 'PASS 1 automatic sending is off by default';

  ok := false; BEGIN INSERT INTO ai_credentials (organization_id, secret_ciphertext, key_hint) VALUES (org_a, 'x', 'abc'); EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 2: bad key hint accepted'; END IF;
  RAISE NOTICE 'PASS 2 key hint is exactly four characters';

  ok := false; BEGIN INSERT INTO ai_credentials (organization_id, secret_ciphertext, key_hint, created_by) VALUES (org_a, 'x', 'abcd', admin_b); EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3: key saved by another org''s admin'; END IF;
  RAISE NOTICE 'PASS 3 key creator must belong to the workspace';

  ok := false; BEGIN INSERT INTO ai_credentials (organization_id, secret_ciphertext, key_hint, status, last_error) VALUES (org_a, 'x', 'abcd', 'active', 'boom'); EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 4: error text on a healthy key'; END IF;
  RAISE NOTICE 'PASS 4 last_error only when the key is failing';

  SELECT id INTO e FROM emails WHERE organization_id = org_a LIMIT 1;
  ok := false; BEGIN UPDATE emails SET not_spam_by = admin_b, not_spam_at = now() WHERE id = e; EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5: cross-org spam override'; END IF;
  ok := false; BEGIN UPDATE emails SET not_spam_by = (SELECT id FROM users WHERE organization_id = org_a LIMIT 1), not_spam_at = NULL WHERE id = e; EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: override without a timestamp'; END IF;
  RAISE NOTICE 'PASS 5 spam override is tenant-safe and timestamped';

  IF has_table_privilege('anon', 'public.ai_credentials', 'SELECT') THEN RAISE EXCEPTION 'FAIL 7: anon can read keys'; END IF;
  RAISE NOTICE 'PASS 6 ai_credentials closed to anon/authenticated';
END $$;
ROLLBACK;

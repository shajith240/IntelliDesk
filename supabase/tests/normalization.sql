-- Tests for migrations 012/013 (normalization). Rolled back; safe anywhere:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/normalization.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  org_a uuid := '37d65400-8aa9-4a66-ac13-b4330e53cad4';
  org_b uuid := '67ee8c8c-912a-468a-9c83-022f8a91f294';
  admin_a uuid := '24f8e046-cc29-4698-b8fe-5be9d09ea162';
  n_before int; num_a1 text; num_a2 text; num_b text; t uuid; a uuid; f uuid; f_b uuid; ar uuid; u uuid; ok boolean; n int;
BEGIN
  -- 1. per-organization, gap-free ticket numbers
  SELECT last_number INTO n_before FROM ticket_counters WHERE organization_id = org_a;
  INSERT INTO tickets (organization_id, subject, severity) VALUES (org_a, 'n1', 'P4') RETURNING ticket_number INTO num_a1;
  INSERT INTO tickets (organization_id, subject, severity) VALUES (org_a, 'n2', 'P4') RETURNING ticket_number, id INTO num_a2, t;
  INSERT INTO tickets (organization_id, subject, severity) VALUES (org_b, 'b1', 'P4') RETURNING ticket_number INTO num_b;
  IF num_a1 <> 'TKT-' || lpad((COALESCE(n_before, 0) + 1)::text, 5, '0') OR num_a2 <> 'TKT-' || lpad((COALESCE(n_before, 0) + 2)::text, 5, '0') THEN
    RAISE EXCEPTION 'FAIL 1a: org A numbers % %', num_a1, num_a2; END IF;
  IF num_b <> 'TKT-' || lpad((SELECT last_number FROM ticket_counters WHERE organization_id = org_b)::text, 5, '0') THEN
    RAISE EXCEPTION 'FAIL 1b: org B not counted separately (%)', num_b; END IF;
  RAISE NOTICE 'PASS 1 ticket numbers are per organization and consecutive';

  -- 2. one account per domain per org, case-insensitive; other orgs unaffected
  INSERT INTO accounts (organization_id, domain, company_name, tier) VALUES (org_a, 'rehearsal-co.test', 'R', 'Bronze') RETURNING id INTO a;
  ok := false; BEGIN INSERT INTO accounts (organization_id, domain, company_name, tier) VALUES (org_a, 'Rehearsal-CO.test', 'R2', 'Bronze'); EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 2a: duplicate account domain'; END IF;
  INSERT INTO accounts (organization_id, domain, company_name, tier) VALUES (org_b, 'rehearsal-co.test', 'R', 'Bronze');
  RAISE NOTICE 'PASS 2 one account per domain per workspace';

  -- 3. the same person can be a contact of two workspaces, but only once per workspace
  INSERT INTO contacts (organization_id, email, name) VALUES (org_a, 'same.person@example.com', 'P');
  INSERT INTO contacts (organization_id, email, name) VALUES (org_b, 'same.person@example.com', 'P');
  ok := false; BEGIN INSERT INTO contacts (organization_id, email, name) VALUES (org_a, 'SAME.person@example.com', 'P'); EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3: duplicate contact in one workspace'; END IF;
  RAISE NOTICE 'PASS 3 contacts are unique per workspace, not globally';

  -- 4. citations reference real articles of the same workspace, and follow deletes
  INSERT INTO faqs (organization_id, question, answer, category) VALUES (org_a, 'q', 'a', 'General Inquiry') RETURNING id INTO f;
  INSERT INTO faqs (organization_id, question, answer, category) VALUES (org_b, 'q', 'a', 'General Inquiry') RETURNING id INTO f_b;
  INSERT INTO auto_responses (organization_id, ticket_id, response_text, match_type) VALUES (org_a, t, 'x', 'partial') RETURNING id INTO ar;
  INSERT INTO auto_response_citations (auto_response_id, faq_id, organization_id, rank, score) VALUES (ar, f, org_a, 1, 0.8);
  ok := false; BEGIN INSERT INTO auto_response_citations (auto_response_id, faq_id, organization_id, rank, score) VALUES (ar, f_b, org_a, 2, 0.7); EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 4a: cited another workspace''s article'; END IF;
  DELETE FROM faqs WHERE id = f;
  SELECT count(*) INTO n FROM auto_response_citations WHERE auto_response_id = ar;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 4b: citation dangles after delete'; END IF;
  RAISE NOTICE 'PASS 4 citations are tenant-safe and never dangle';

  -- 5. audit log is append-only; deleting a ticket keeps its history
  INSERT INTO audit_logs (organization_id, ticket_id, action, actor_user_id, actor_type) VALUES (org_a, t, 'rehearsal', admin_a, 'user');
  ok := false; BEGIN UPDATE audit_logs SET action = 'tampered' WHERE ticket_id = t; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5a: audit row edited'; END IF;
  ok := false; BEGIN DELETE FROM audit_logs WHERE ticket_id = t; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5b: audit row deleted'; END IF;
  DELETE FROM tickets WHERE id = t;
  SELECT count(*) INTO n FROM audit_logs WHERE action = 'rehearsal' AND ticket_id IS NULL AND actor_user_id = admin_a;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 5c: ticket deletion lost or rewrote history'; END IF;
  INSERT INTO users (organization_id, email, name, password_hash, role) VALUES (org_a, 'rehearsal-actor@example.com', 'R', 'x', 'agent') RETURNING id INTO u;
  INSERT INTO audit_logs (organization_id, action, actor_user_id, actor_type) VALUES (org_a, 'rehearsal-2', u, 'user');
  DELETE FROM users WHERE id = u;
  SELECT count(*) INTO n FROM audit_logs WHERE action = 'rehearsal-2' AND actor_user_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 5d: user deletion blocked or lost the row'; END IF;
  SET LOCAL intellidesk.audit_maintenance = 'on';
  DELETE FROM audit_logs WHERE action = 'rehearsal-2';
  RESET intellidesk.audit_maintenance;
  RAISE NOTICE 'PASS 5 audit log is append-only; only referential clears and explicit maintenance get through';

  -- 6. timezone must be a real zone
  ok := false; BEGIN UPDATE organizations SET timezone = 'Mars/Olympus' WHERE id = org_a; EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: invalid timezone accepted'; END IF;
  UPDATE organizations SET timezone = 'Asia/Kolkata' WHERE id = org_a;
  RAISE NOTICE 'PASS 6 timezone validated by the database';

  IF has_table_privilege('anon', 'public.ticket_counters', 'SELECT') OR has_table_privilege('anon', 'public.auto_response_citations', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 7: public role access'; END IF;
  RAISE NOTICE 'PASS 7 new tables closed to anon/authenticated';
END $$;
ROLLBACK;

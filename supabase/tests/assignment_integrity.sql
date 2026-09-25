-- Integrity tests for migration 007 (tenant consistency and the assignment model).
-- Runs entirely inside a transaction that is rolled back, so it is safe to run
-- against any environment, including production:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/assignment_integrity.sql
-- Every check prints PASS; any failure raises and aborts.
-- The fixed organization/user ids below refer to the seeded demo organizations.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  org_a uuid := '37d65400-8aa9-4a66-ac13-b4330e53cad4';
  org_b uuid := '67ee8c8c-912a-468a-9c83-022f8a91f294';
  admin_a uuid := '24f8e046-cc29-4698-b8fe-5be9d09ea162';
  admin_b uuid := '6d3db08a-285f-4439-84db-5fc2fa235a32';
  agent_a uuid; viewer_a uuid; t_a uuid; t_row public.tickets; n int; email_b uuid; acct_a uuid; c_org uuid; ok boolean;
BEGIN
  INSERT INTO users (organization_id, email, name, password_hash, role) VALUES (org_a, 'rehearsal-agent@example.com', 'Rehearsal Agent', 'x', 'agent') RETURNING id INTO agent_a;
  INSERT INTO users (organization_id, email, name, password_hash, role) VALUES (org_a, 'rehearsal-viewer@example.com', 'Rehearsal Viewer', 'x', 'viewer') RETURNING id INTO viewer_a;
  SELECT id INTO t_a FROM tickets WHERE organization_id = org_a LIMIT 1;

  -- 1. cross-org assignment rejected by the composite FK
  ok := false; BEGIN UPDATE tickets SET assigned_agent = admin_b WHERE id = t_a; EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 1a: trigger allowed cross-org assignee'; END IF; RAISE NOTICE 'PASS 1a trigger rejects cross-org assignee';
  ALTER TABLE tickets DISABLE TRIGGER enforce_ticket_assignee;
  ok := false; BEGIN UPDATE tickets SET assigned_agent = admin_b WHERE id = t_a; EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  ALTER TABLE tickets ENABLE TRIGGER enforce_ticket_assignee;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 1b: composite FK allowed cross-org assignee'; END IF; RAISE NOTICE 'PASS 1b composite FK independently rejects cross-org assignee';

  -- 2. viewer cannot hold a ticket
  ok := false; BEGIN UPDATE tickets SET assigned_agent = viewer_a WHERE id = t_a; EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 2: viewer assignee accepted'; END IF; RAISE NOTICE 'PASS 2 viewer assignee rejected';

  -- 3. non-admin actor cannot assign through assign_ticket
  ok := false; BEGIN PERFORM assign_ticket(org_a, t_a, agent_a, agent_a, NULL); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3: agent was able to assign'; END IF; RAISE NOTICE 'PASS 3 non-admin actor rejected';

  -- 4. admin assigns: ticket + history + audit written together
  t_row := assign_ticket(org_a, t_a, agent_a, admin_a, 'rehearsal');
  IF t_row.assigned_agent IS DISTINCT FROM agent_a THEN RAISE EXCEPTION 'FAIL 4a: assignee not set'; END IF;
  SELECT count(*) INTO n FROM ticket_assignments WHERE ticket_id = t_a AND assigned_to = agent_a AND assigned_by = admin_a;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4b: history row missing'; END IF;
  SELECT count(*) INTO n FROM audit_logs WHERE ticket_id = t_a AND action = 'ticket_assigned' AND actor_user_id = admin_a;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4c: audit row missing'; END IF;
  RAISE NOTICE 'PASS 4 admin assignment is atomic with history and audit';

  -- 4d. admin from another org cannot assign org A's ticket
  ok := false; BEGIN PERFORM assign_ticket(org_a, t_a, NULL, admin_b, NULL); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 4d: foreign admin assigned'; END IF; RAISE NOTICE 'PASS 4d foreign-org admin rejected';

  -- 4e. deactivating the assignee keeps the ticket consistent; deleting sets NULL (org untouched)
  DELETE FROM users WHERE id = agent_a;
  SELECT * INTO t_row FROM tickets WHERE id = t_a;
  IF t_row.assigned_agent IS NOT NULL OR t_row.organization_id IS DISTINCT FROM org_a THEN RAISE EXCEPTION 'FAIL 4e: ON DELETE SET NULL (col) misbehaved'; END IF;
  RAISE NOTICE 'PASS 4e deleting assignee nulls only assigned_agent';

  -- 5. a ticket's team must be a team of the same organization (composite FK)
  UPDATE tickets SET assigned_team_id = (SELECT id FROM teams WHERE organization_id = org_a LIMIT 1) WHERE id = t_a;
  ok := false; BEGIN UPDATE tickets SET assigned_team_id = gen_random_uuid() WHERE id = t_a; EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5a: unknown team accepted'; END IF;
  IF EXISTS (SELECT 1 FROM teams WHERE organization_id = org_b) THEN
    ok := false; BEGIN UPDATE tickets SET assigned_team_id = (SELECT id FROM teams WHERE organization_id = org_b LIMIT 1) WHERE id = t_a;
      EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL 5b: cross-org team accepted'; END IF;
  END IF;
  RAISE NOTICE 'PASS 5 team must exist in the same organization';

  -- 6. a conversation message cannot attach another organization's email
  INSERT INTO emails (organization_id, from_address, to_address, subject, body_text, received_at) VALUES (org_b, 'rehearsal@example.com', 's@example.com', 'rehearsal', 'x', now()) RETURNING id INTO email_b;
  ok := false; BEGIN INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text) VALUES (org_a, t_a, 'customer', 'customer', email_b, 'x');
    EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: cross-org email attached'; END IF;
  RAISE NOTICE 'PASS 6 cross-org email can''t join a conversation';

  -- 7. contacts inserted the old way (no org) inherit it from the account
  SELECT id INTO acct_a FROM accounts WHERE organization_id = org_a LIMIT 1;
  INSERT INTO contacts (account_id, email, name) VALUES (acct_a, 'rehearsal-contact@example.com', 'R') RETURNING organization_id INTO c_org;
  IF c_org IS DISTINCT FROM org_a THEN RAISE EXCEPTION 'FAIL 7: contact org not derived'; END IF; RAISE NOTICE 'PASS 7 contact org derived from account';

  -- 8. existing SLA lookups (.eq(severity).single()) still see exactly one row each
  SELECT count(*) INTO n FROM (SELECT severity FROM sla_policies GROUP BY severity HAVING count(*) = 1) x;
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL 8: SLA lookup would break'; END IF; RAISE NOTICE 'PASS 8 SLA single-row lookups unaffected';

  -- 9. every contact now has an organization; no NULL org anywhere
  SELECT count(*) INTO n FROM contacts WHERE organization_id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 9: % contacts without org', n; END IF; RAISE NOTICE 'PASS 9 all contacts backfilled';

  -- 10. new tables/functions are closed to the public roles
  IF has_table_privilege('anon', 'public.ticket_assignments', 'SELECT') OR has_table_privilege('anon', 'public.mailbox_connections', 'SELECT')
     OR has_table_privilege('authenticated', 'public.auth_login_attempts', 'INSERT')
     OR has_function_privilege('anon', 'public.assign_ticket(uuid,uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 10: public role has access to new objects'; END IF;
  RAISE NOTICE 'PASS 10 new objects closed to anon/authenticated';
END $$;
ROLLBACK;

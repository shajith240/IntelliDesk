-- Tests for migration 010 (record_inbound_message). Rolled back; safe anywhere:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/inbound_messages.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  org_a uuid := '37d65400-8aa9-4a66-ac13-b4330e53cad4';
  org_b uuid := '67ee8c8c-912a-468a-9c83-022f8a91f294';
  r record; r2 record; e1 uuid; e2 uuid; e3 uuid; e4 uuid; eb uuid; t_status text; t_sev text; n int;
  payload jsonb := '{"subject":"Printer on fire","severity":"P3","category":"Technical Support","ai_confidence":0.9,"is_flagged_for_review":true}';
BEGIN
  INSERT INTO emails (organization_id, from_address, to_address, subject, body_text) VALUES (org_a, 'c@example.com', 's@example.com', 'Printer', 'on fire') RETURNING id INTO e1;
  INSERT INTO emails (organization_id, from_address, to_address, subject, body_text) VALUES (org_a, 'c@example.com', 's@example.com', 'Re: Printer', 'still') RETURNING id INTO e2;
  INSERT INTO emails (organization_id, from_address, to_address, subject, body_text) VALUES (org_a, 'c@example.com', 's@example.com', 'Re: Printer', 'again') RETURNING id INTO e3;
  INSERT INTO emails (organization_id, from_address, to_address, subject, body_text) VALUES (org_a, 'c@example.com', 's@example.com', 'Re: Printer', 'later') RETURNING id INTO e4;
  INSERT INTO emails (organization_id, from_address, to_address, subject, body_text) VALUES (org_b, 'x@example.com', 's@example.com', 'B', 'b') RETURNING id INTO eb;

  -- 1. a new email creates the ticket and its first message together
  SELECT * INTO r FROM record_inbound_message(org_a, e1, 'on fire', NULL, payload);
  IF NOT r.created THEN RAISE EXCEPTION 'FAIL 1a: ticket not created'; END IF;
  SELECT count(*) INTO n FROM ticket_messages WHERE ticket_id = r.ticket_id AND email_id = e1 AND kind = 'customer';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 1b: first message missing'; END IF;
  SELECT count(*) INTO n FROM tickets WHERE id = r.ticket_id AND is_flagged_for_review AND status = 'New' AND severity = 'P3';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 1c: ticket fields not taken from payload'; END IF;
  RAISE NOTICE 'PASS 1 ticket and first message created together';

  -- 2. idempotent: the same email again returns the same ticket, creates nothing
  SELECT * INTO r2 FROM record_inbound_message(org_a, e1, 'on fire', NULL, payload);
  IF r2.ticket_id <> r.ticket_id OR r2.created THEN RAISE EXCEPTION 'FAIL 2a: retry created a new ticket'; END IF;
  SELECT count(*) INTO n FROM tickets WHERE organization_id = org_a AND subject = 'Printer on fire';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 2b: % tickets after retry', n; END IF;
  RAISE NOTICE 'PASS 2 retrying the same email is a no-op';

  -- 3. reply to a Pending ticket is appended and reopens it; a more urgent reply raises priority
  UPDATE tickets SET status = 'Pending' WHERE id = r.ticket_id;
  SELECT * INTO r2 FROM record_inbound_message(org_a, e2, 'still', r.ticket_id, payload || '{"severity":"P1"}');
  SELECT status, severity INTO t_status, t_sev FROM tickets WHERE id = r.ticket_id;
  IF r2.created OR NOT r2.reopened OR t_status <> 'In Progress' THEN RAISE EXCEPTION 'FAIL 3a: not reopened'; END IF;
  IF t_sev <> 'P1' THEN RAISE EXCEPTION 'FAIL 3b: priority not raised'; END IF;
  SELECT count(*) INTO n FROM audit_logs WHERE ticket_id = r.ticket_id AND action = 'ticket_reopened';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 3c: reopen not audited'; END IF;
  RAISE NOTICE 'PASS 3 reply to Pending reopens and raises priority';

  -- 4. a less urgent reply never lowers priority
  SELECT * INTO r2 FROM record_inbound_message(org_a, e3, 'again', r.ticket_id, payload || '{"severity":"P4"}');
  SELECT severity INTO t_sev FROM tickets WHERE id = r.ticket_id;
  IF t_sev <> 'P1' THEN RAISE EXCEPTION 'FAIL 4: priority lowered to %', t_sev; END IF;
  RAISE NOTICE 'PASS 4 priority is never lowered by a reply';

  -- 5. reply to a Closed ticket starts a follow-up ticket
  UPDATE tickets SET status = 'Closed' WHERE id = r.ticket_id;
  SELECT * INTO r2 FROM record_inbound_message(org_a, e4, 'later', r.ticket_id, payload);
  IF NOT r2.created OR r2.ticket_id = r.ticket_id THEN RAISE EXCEPTION 'FAIL 5a: no follow-up ticket'; END IF;
  SELECT count(*) INTO n FROM tickets WHERE id = r2.ticket_id AND follow_up_of = r.ticket_id;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 5b: follow-up not linked'; END IF;
  RAISE NOTICE 'PASS 5 reply to Closed creates a linked follow-up';

  -- 6. a thread match in another organization is ignored (new ticket in the right org)
  SELECT * INTO r2 FROM record_inbound_message(org_b, eb, 'b', r.ticket_id, payload);
  SELECT count(*) INTO n FROM tickets WHERE id = r2.ticket_id AND organization_id = org_b AND follow_up_of IS NULL;
  IF NOT r2.created OR n <> 1 THEN RAISE EXCEPTION 'FAIL 6: cross-org thread match was used'; END IF;
  RAISE NOTICE 'PASS 6 cross-org thread match ignored';

  IF has_function_privilege('anon', 'public.record_inbound_message(uuid,uuid,text,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 7: anon can execute'; END IF;
  RAISE NOTICE 'PASS 7 function closed to anon';
END $$;
ROLLBACK;

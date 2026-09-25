-- Tests for migration 009 (ticket workflow and conversation model).
-- Runs inside a transaction that is rolled back, so it is safe against any
-- environment, including production:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conversation_model.sql
-- Every check prints PASS; any failure raises and aborts.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  org_a uuid := '37d65400-8aa9-4a66-ac13-b4330e53cad4';
  org_b uuid := '67ee8c8c-912a-468a-9c83-022f8a91f294';
  admin_a uuid := '24f8e046-cc29-4698-b8fe-5be9d09ea162';
  t_a uuid; t_b uuid; t_row public.tickets; n int; ok boolean;
  in_email uuid; out_email uuid; msg uuid; draft uuid; ts timestamptz;
BEGIN
  INSERT INTO tickets (organization_id, subject, severity) VALUES (org_a, 'Rehearsal ticket A', 'P3') RETURNING id INTO t_a;
  INSERT INTO tickets (organization_id, subject, severity) VALUES (org_b, 'Rehearsal ticket B', 'P3') RETURNING id INTO t_b;

  -- 1. the workflow: Closed is terminal, unknown statuses are rejected
  UPDATE tickets SET status = 'Closed' WHERE id = t_b;
  ok := false; BEGIN UPDATE tickets SET status = 'In Progress' WHERE id = t_b; EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 1a: Closed ticket was reopened'; END IF;
  ok := false; BEGIN INSERT INTO tickets (organization_id, subject, severity, status) VALUES (org_a, 'x', 'P4', 'Escalated'); EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 1b: unknown status accepted'; END IF;
  RAISE NOTICE 'PASS 1 invalid transitions and unknown statuses rejected';

  -- 2. the database owns the resolution timestamp
  UPDATE tickets SET status = 'Resolved' WHERE id = t_a RETURNING sla_resolved_at INTO ts;
  IF ts IS NULL THEN RAISE EXCEPTION 'FAIL 2a: resolved_at not set'; END IF;
  UPDATE tickets SET status = 'In Progress' WHERE id = t_a RETURNING sla_resolved_at INTO ts;
  IF ts IS NOT NULL THEN RAISE EXCEPTION 'FAIL 2b: reopen kept resolved_at'; END IF;
  UPDATE tickets SET status = 'Resolved' WHERE id = t_a;
  UPDATE tickets SET sla_resolved_at = now() - interval '2 days' WHERE id = t_a;  -- as if resolved two days ago
  UPDATE tickets SET status = 'Closed' WHERE id = t_a RETURNING sla_resolved_at INTO ts;
  IF ts > now() - interval '1 day' THEN RAISE EXCEPTION 'FAIL 2c: closing overwrote the resolution time'; END IF;
  RAISE NOTICE 'PASS 2 resolved_at set on resolve, cleared on reopen, kept on close';

  -- 3. follow-up tickets point at a ticket of the same organization
  ok := false; BEGIN INSERT INTO tickets (organization_id, subject, severity, follow_up_of) VALUES (org_a, 'x', 'P4', t_b);
    EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3: cross-org follow-up accepted'; END IF;
  RAISE NOTICE 'PASS 3 follow-up link is tenant-safe';

  -- A fresh open ticket for the message tests.
  INSERT INTO tickets (organization_id, subject, severity) VALUES (org_a, 'Rehearsal ticket A2', 'P3') RETURNING id INTO t_a;
  INSERT INTO emails (organization_id, from_address, to_address, subject, body_text, processed)
    VALUES (org_a, 'customer@example.com', 'support@example.com', 'Help', 'Hi', true) RETURNING id INTO in_email;
  INSERT INTO emails (organization_id, direction, from_address, to_address, subject, body_text, processed)
    VALUES (org_a, 'outbound', 'support@example.com', 'customer@example.com', 'Re: Help', 'Hello', true) RETURNING id INTO out_email;

  -- 4. outbound mail can never sit in the intake queue
  ok := false; BEGIN INSERT INTO emails (organization_id, direction, from_address, to_address, subject, body_text, processed)
    VALUES (org_a, 'outbound', 'a@b.co', 'c@d.co', 's', 'b', false); EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 4: unprocessed outbound email accepted'; END IF;
  RAISE NOTICE 'PASS 4 outbound emails are never queued';

  -- 5. message shape: direction of the linked email must match the kind
  INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text)
    VALUES (org_a, t_a, 'customer', 'customer', in_email, 'Hi');
  ok := false; BEGIN INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text)
    VALUES (org_a, t_a, 'customer', 'customer', out_email, 'x'); EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5a: customer message linked to an outbound email'; END IF;
  ok := false; BEGIN INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, author_user_id, email_id, body_text)
    VALUES (org_a, t_a, 'note', 'agent', admin_a, out_email, 'x'); EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5b: internal note linked to an email'; END IF;
  ok := false; BEGIN INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, author_user_id, body_text)
    VALUES (org_a, t_a, 'customer', 'customer', admin_a, 'x'); EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5c: customer message carried a user'; END IF;
  ok := false; BEGIN INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text)
    VALUES (org_a, t_a, 'customer', 'customer', in_email, 'again'); EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5d: one email became two messages'; END IF;
  RAISE NOTICE 'PASS 5 message kind, author and email direction are consistent';

  -- 6. tenant isolation: a message can't attach to another org's ticket
  ok := false; BEGIN INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, author_user_id, body_text)
    VALUES (org_a, t_b, 'note', 'agent', admin_a, 'x'); EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: cross-org message accepted'; END IF;
  RAISE NOTICE 'PASS 6 cross-org message rejected';

  -- 7. complete_ticket_reply records everything at once
  INSERT INTO auto_responses (organization_id, ticket_id, response_text, match_type, sent)
    VALUES (org_a, t_a, 'AI suggestion', 'partial', false) RETURNING id INTO draft;
  INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, author_user_id, body_text, delivery_status)
    VALUES (org_a, t_a, 'reply', 'agent', admin_a, 'Edited by agent', 'sending') RETURNING id INTO msg;
  t_row := complete_ticket_reply(org_a, msg, '<rehearsal@example.com>', 'support@example.com', 'customer@example.com',
                                 'Re: Help', NULL, NULL, '{}', 'Pending', draft);
  IF t_row.status <> 'Pending' OR t_row.sla_first_response_at IS NULL THEN RAISE EXCEPTION 'FAIL 7a: ticket not updated'; END IF;
  SELECT count(*) INTO n FROM ticket_messages m JOIN emails e ON e.id = m.email_id
    WHERE m.id = msg AND m.delivery_status = 'sent' AND e.direction = 'outbound' AND e.message_id = '<rehearsal@example.com>';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 7b: outbound email not linked'; END IF;
  SELECT count(*) INTO n FROM auto_responses WHERE id = draft AND sent AND sent_message_id = msg AND response_text = 'AI suggestion';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 7c: draft not linked, or its text was overwritten'; END IF;
  SELECT count(*) INTO n FROM audit_logs WHERE ticket_id = t_a AND action = 'reply_sent' AND actor_user_id = admin_a;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 7d: audit row missing'; END IF;
  ok := false; BEGIN PERFORM complete_ticket_reply(org_a, msg, '<again@example.com>', 'a', 'b', 's', NULL, NULL, '{}', NULL, NULL);
    EXCEPTION WHEN invalid_parameter_value THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 7e: a reply was recorded twice'; END IF;
  RAISE NOTICE 'PASS 7 complete_ticket_reply is atomic and single-use';

  -- 8. a disallowed status after sending is skipped, never raised (the email is already out)
  UPDATE tickets SET status = 'Closed' WHERE id = t_a;
  INSERT INTO ticket_messages (organization_id, ticket_id, kind, author_type, body_text, delivery_status)
    VALUES (org_a, t_a, 'reply', 'ai', 'late', 'sending') RETURNING id INTO msg;
  t_row := complete_ticket_reply(org_a, msg, NULL, 'a@b.co', 'c@d.co', 's', NULL, NULL, NULL, 'Pending', NULL);
  IF t_row.status <> 'Closed' THEN RAISE EXCEPTION 'FAIL 8: invalid transition applied'; END IF;
  RAISE NOTICE 'PASS 8 recording a reply never fails on the status rule';

  -- 9. the first response time is not moved by later replies
  SELECT sla_first_response_at INTO ts FROM tickets WHERE id = t_a;
  IF ts IS DISTINCT FROM (SELECT created_at FROM ticket_messages WHERE ticket_id = t_a AND kind = 'reply' ORDER BY created_at LIMIT 1) THEN
    RAISE EXCEPTION 'FAIL 9: first response time moved'; END IF;
  RAISE NOTICE 'PASS 9 first response time is the first reply';

  -- 10. backfill: every linked inbound email is a customer message
  SELECT count(*) INTO n FROM ticket_emails te
    WHERE NOT EXISTS (SELECT 1 FROM ticket_messages m WHERE m.email_id = te.email_id AND m.ticket_id = te.ticket_id);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 10: % linked emails have no message', n; END IF;
  RAISE NOTICE 'PASS 10 existing conversations backfilled';

  -- 11. transition bridge: a link written the old way still becomes a message
  INSERT INTO emails (organization_id, from_address, to_address, subject, body_text, processed)
    VALUES (org_a, 'legacy@example.com', 'support@example.com', 'Old path', 'Body', true) RETURNING id INTO in_email;
  INSERT INTO ticket_emails (ticket_id, email_id, relationship) VALUES (t_a, in_email, 'reply');
  SELECT count(*) INTO n FROM ticket_messages WHERE email_id = in_email AND kind = 'customer' AND ticket_id = t_a;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 11: legacy link not mirrored'; END IF;
  RAISE NOTICE 'PASS 11 legacy ticket_emails inserts are mirrored';

  -- 12. new objects closed to the public roles
  IF has_table_privilege('anon', 'public.ticket_messages', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ticket_status_transitions', 'SELECT')
     OR has_function_privilege('anon', 'public.complete_ticket_reply(uuid,uuid,text,text,text,text,text,text,text[],text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 12: public role has access to new objects'; END IF;
  RAISE NOTICE 'PASS 12 new objects closed to anon/authenticated';
END $$;
ROLLBACK;

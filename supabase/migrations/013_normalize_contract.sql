-- 013: Normalization, contract step. Applied after the code that stopped
-- using these columns was deployed (see 012 for the expand step).
--
-- Every column removed here was either unused or derivable, i.e. storing it
-- created a second source of truth that could drift from the first:
--   tickets.sla_breach            -> computed from due dates and timestamps (sla-tracker)
--   tickets.auto_response_sent/_type -> ticket_messages (author_type = 'ai') / auto_responses
--   tickets.assigned_team (text)  -> teams.name via assigned_team_id (transitive dependency)
--   tickets.ai_confidence         -> now GENERATED from ai_classification: stored for
--                                    sorting/averaging, but it cannot disagree
--   auto_responses.sent/sent_at   -> sent_message_id IS NOT NULL / that message's created_at
--   auto_responses.cited_*_ids    -> auto_response_citations (1NF, real foreign keys)
--   faqs.times_used/success_rate/avg_resolution_minutes -> derived from citations
--   emails/faqs.embedding_id      -> the vector id is the row id
--   audit_logs.performed_by       -> actor_user_id + actor_type
--   ticket_emails                 -> ticket_messages.email_id (an email belongs to one ticket)
-- Unused CRM leftovers (contacts.subscribed_modules[] etc., teams.category_routing[],
-- organizations.email_config) go too.

BEGIN;

-- Contacts are matched by exact lowercase email from now on.
UPDATE public.contacts SET email = lower(email) WHERE email <> lower(email);
UPDATE public.accounts SET domain = lower(domain) WHERE domain <> lower(domain);

-- ---------------------------------------------------------------------------
-- Functions that wrote the old columns, redefined first
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_ticket(
  p_org_id uuid,
  p_ticket_id uuid,
  p_assignee_id uuid,
  p_actor_id uuid,
  p_note text DEFAULT NULL
)
RETURNS public.tickets
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ticket public.tickets;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_id AND organization_id = p_org_id AND is_active AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only an active admin of this organization can assign tickets'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_ticket FROM public.tickets
  WHERE id = p_ticket_id AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_ticket.assigned_agent IS NOT DISTINCT FROM p_assignee_id THEN
    RETURN v_ticket;
  END IF;

  UPDATE public.tickets SET assigned_agent = p_assignee_id
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  INSERT INTO public.ticket_assignments (organization_id, ticket_id, assigned_to, assigned_by, note)
  VALUES (p_org_id, p_ticket_id, p_assignee_id, p_actor_id, p_note);

  INSERT INTO public.audit_logs (organization_id, ticket_id, action, details, actor_user_id, actor_type)
  VALUES (
    p_org_id, p_ticket_id,
    CASE WHEN p_assignee_id IS NULL THEN 'ticket_unassigned' ELSE 'ticket_assigned' END,
    jsonb_build_object('assigned_to', p_assignee_id, 'note', p_note),
    p_actor_id, 'user'
  );

  RETURN v_ticket;
END;
$$;


CREATE OR REPLACE FUNCTION public.complete_ticket_reply(
  p_org_id        uuid,
  p_message_id    uuid,
  p_smtp_message_id text,
  p_from_address  text,
  p_to_address    text,
  p_subject       text,
  p_body_html     text,
  p_in_reply_to   text,
  p_references    text[],
  p_status_after  text DEFAULT NULL,
  p_draft_id      uuid DEFAULT NULL
)
RETURNS public.tickets
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_message public.ticket_messages;
  v_ticket  public.tickets;
  v_email_id uuid;
BEGIN
  SELECT * INTO v_message FROM public.ticket_messages
  WHERE id = p_message_id AND organization_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_message.kind <> 'reply' OR v_message.delivery_status <> 'sending' THEN
    RAISE EXCEPTION 'Message % is not a reply waiting to be recorded', p_message_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_ticket FROM public.tickets
  WHERE id = v_message.ticket_id AND organization_id = p_org_id
  FOR UPDATE;

  INSERT INTO public.emails (
    organization_id, direction, message_id, in_reply_to, references_header,
    from_address, to_address, subject, body_text, body_html, received_at, processed
  ) VALUES (
    p_org_id, 'outbound', p_smtp_message_id, p_in_reply_to, COALESCE(p_references, '{}'),
    p_from_address, p_to_address, p_subject, v_message.body_text, p_body_html, now(), true
  ) RETURNING id INTO v_email_id;

  UPDATE public.ticket_messages
  SET delivery_status = 'sent', delivery_error = NULL, email_id = v_email_id
  WHERE id = p_message_id;

  UPDATE public.tickets
  SET sla_first_response_at = COALESCE(sla_first_response_at, v_message.created_at),
      status = CASE
        WHEN p_status_after IS NOT NULL AND p_status_after <> v_ticket.status AND EXISTS (
          SELECT 1 FROM public.ticket_status_transitions
          WHERE from_status = v_ticket.status AND to_status = p_status_after
        ) THEN p_status_after
        ELSE status
      END
  WHERE id = v_ticket.id
  RETURNING * INTO v_ticket;

  IF p_draft_id IS NOT NULL THEN
    UPDATE public.auto_responses
    SET sent_message_id = p_message_id
    WHERE id = p_draft_id AND organization_id = p_org_id AND ticket_id = v_ticket.id AND sent_message_id IS NULL;
  END IF;

  INSERT INTO public.audit_logs (organization_id, ticket_id, action, details, actor_user_id, actor_type)
  VALUES (
    p_org_id, v_ticket.id, 'reply_sent',
    jsonb_build_object('message_id', p_message_id, 'to', p_to_address, 'draft_id', p_draft_id,
                       'status', v_ticket.status, 'author', v_message.author_type),
    v_message.author_user_id,
    CASE WHEN v_message.author_type = 'agent' THEN 'user' ELSE 'system' END
  );

  RETURN v_ticket;
END;
$$;


CREATE OR REPLACE FUNCTION public.record_inbound_message(
  p_org_id           uuid,
  p_email_id         uuid,
  p_body             text,
  p_thread_ticket_id uuid,     -- ticket the thread detector matched, or NULL
  p_new_ticket       jsonb     -- fields for a new ticket (subject, severity, category, ...)
)
RETURNS TABLE (ticket_id uuid, ticket_number text, created boolean, reopened boolean)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_existing  uuid;
  v_ticket    public.tickets;
  v_new       public.tickets;
  v_reopened  boolean := false;
  v_follow_up uuid := NULL;
  v_severity  text := p_new_ticket ->> 'severity';
BEGIN
  -- Idempotency: this email is already on a ticket.
  SELECT m.ticket_id INTO v_existing
  FROM public.ticket_messages m
  WHERE m.email_id = p_email_id AND m.organization_id = p_org_id;
  IF FOUND THEN
    RETURN QUERY
      SELECT t.id, t.ticket_number, false, false FROM public.tickets t WHERE t.id = v_existing;
    RETURN;
  END IF;

  IF p_thread_ticket_id IS NOT NULL THEN
    SELECT * INTO v_ticket FROM public.tickets
    WHERE id = p_thread_ticket_id AND organization_id = p_org_id
    FOR UPDATE;
  END IF;

  IF v_ticket.id IS NOT NULL AND v_ticket.status <> 'Closed' THEN
    INSERT INTO public.ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text)
    VALUES (p_org_id, v_ticket.id, 'customer', 'customer', p_email_id, left(p_body, 100000));

    v_reopened := v_ticket.status IN ('Pending', 'Resolved');
    UPDATE public.tickets
    SET status   = CASE WHEN v_reopened THEN 'In Progress' ELSE status END,
        -- P1 < P2 < P3 < P4 as text: keep the more urgent of the two.
        severity = CASE WHEN v_severity IS NOT NULL AND v_severity < severity THEN v_severity ELSE severity END
    WHERE id = v_ticket.id;

    IF v_reopened THEN
      INSERT INTO public.audit_logs (organization_id, ticket_id, action, details, actor_type)
      VALUES (p_org_id, v_ticket.id, 'ticket_reopened',
              jsonb_build_object('from_status', v_ticket.status, 'email_id', p_email_id), 'system');
    END IF;

    RETURN QUERY SELECT v_ticket.id, v_ticket.ticket_number, false, v_reopened;
    RETURN;
  END IF;

  -- New ticket, or a follow-up to a Closed one.
  IF v_ticket.id IS NOT NULL THEN
    v_follow_up := v_ticket.id;
  END IF;

  v_new := jsonb_populate_record(NULL::public.tickets, p_new_ticket);
  INSERT INTO public.tickets (
    organization_id, status, subject, summary, severity, category, subcategory,
    contact_id, account_id, ai_classification, is_flagged_for_review, follow_up_of
  ) VALUES (
    p_org_id, 'New', v_new.subject, v_new.summary, v_new.severity, v_new.category, v_new.subcategory,
    v_new.contact_id, v_new.account_id, v_new.ai_classification,
    COALESCE(v_new.is_flagged_for_review, false), v_follow_up
  )
  RETURNING * INTO v_new;

  INSERT INTO public.ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text)
  VALUES (p_org_id, v_new.id, 'customer', 'customer', p_email_id, left(p_body, 100000));

  RETURN QUERY SELECT v_new.id, v_new.ticket_number, true, false;
END;
$$;


-- ---------------------------------------------------------------------------
-- Drop the bridge from 009 and the legacy join table
-- ---------------------------------------------------------------------------
DROP TABLE public.ticket_emails;                         -- its triggers go with it
DROP FUNCTION public.mirror_ticket_email_to_message();
DROP FUNCTION public.enforce_ticket_email_same_org();

-- ---------------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------------
DROP TRIGGER sync_ticket_team ON public.tickets;
DROP FUNCTION public.sync_ticket_team();
ALTER TABLE public.tickets
  DROP COLUMN assigned_team,
  DROP COLUMN sla_breach,
  DROP COLUMN auto_response_sent,
  DROP COLUMN auto_response_type,
  DROP COLUMN escalation_count,
  DROP COLUMN ai_confidence;
ALTER TABLE public.tickets
  ADD COLUMN ai_confidence real
    GENERATED ALWAYS AS ((ai_classification ->> 'confidence')::real) STORED;

-- ---------------------------------------------------------------------------
-- auto_responses, faqs, emails
-- ---------------------------------------------------------------------------
ALTER TABLE public.auto_responses
  DROP COLUMN cited_faq_ids,
  DROP COLUMN cited_ticket_ids,
  DROP COLUMN sent,
  DROP COLUMN sent_at;
ALTER TABLE public.faqs
  DROP COLUMN times_used,
  DROP COLUMN success_rate,
  DROP COLUMN avg_resolution_minutes,
  DROP COLUMN embedding_id;
ALTER TABLE public.emails DROP COLUMN embedding_id;

-- ---------------------------------------------------------------------------
-- Unused leftovers
-- ---------------------------------------------------------------------------
ALTER TABLE public.contacts
  DROP COLUMN subscribed_modules,
  DROP COLUMN is_lead,
  DROP COLUMN lead_status,
  DROP COLUMN last_login;
ALTER TABLE public.teams DROP COLUMN category_routing;
ALTER TABLE public.organizations DROP COLUMN email_config;
ALTER TABLE public.audit_logs DROP COLUMN performed_by;

COMMIT;

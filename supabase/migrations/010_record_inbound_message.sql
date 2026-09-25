-- 010: Record an inbound customer email atomically and idempotently.
--
-- Before: the pipeline created a ticket, then linked the email in a separate
-- call, and marked the email processed before either. A failure in between
-- left a ticket with no messages, or an email that was "processed" but on no
-- ticket, and a retry could create a second ticket.
--
-- record_inbound_message() is the single commit point for an inbound email.
-- ticket_messages.email_id is UNIQUE, so the function is idempotent: calling
-- it again for the same email returns the ticket it already belongs to.
--
-- Business rules it applies (the Zendesk/Zammad convention):
--   * reply to an open ticket (New / In Progress)  -> appended
--   * reply to a Pending or Resolved ticket         -> appended and reopened (In Progress)
--   * reply to a Closed ticket                      -> new follow-up ticket (follow_up_of)
--   * a more urgent reply raises the ticket's priority, never lowers it

BEGIN;

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
      INSERT INTO public.audit_logs (organization_id, ticket_id, action, details, performed_by, actor_type)
      VALUES (p_org_id, v_ticket.id, 'ticket_reopened',
              jsonb_build_object('from_status', v_ticket.status, 'email_id', p_email_id), 'system', 'system');
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
    contact_id, account_id, ai_confidence, ai_classification, is_flagged_for_review, follow_up_of
  ) VALUES (
    p_org_id, 'New', v_new.subject, v_new.summary, v_new.severity, v_new.category, v_new.subcategory,
    v_new.contact_id, v_new.account_id, v_new.ai_confidence, v_new.ai_classification,
    COALESCE(v_new.is_flagged_for_review, false), v_follow_up
  )
  RETURNING * INTO v_new;

  INSERT INTO public.ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text)
  VALUES (p_org_id, v_new.id, 'customer', 'customer', p_email_id, left(p_body, 100000));

  RETURN QUERY SELECT v_new.id, v_new.ticket_number, true, false;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inbound_message(uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_inbound_message(uuid, uuid, text, uuid, jsonb) TO service_role;

COMMIT;

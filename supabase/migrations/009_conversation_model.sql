-- 009: Conversation model and ticket lifecycle (expand).
--
-- Until now only inbound mail was stored (emails + ticket_emails); replies the
-- team sent lived as an edited AI draft in auto_responses, and internal notes
-- didn't exist. A ticket's conversation could not be reconstructed.
--
-- This migration introduces:
--   * ticket_statuses / ticket_status_transitions: the status workflow as data,
--     enforced by a trigger instead of scattered application checks.
--   * ticket_messages: one row per customer email, public reply, or internal
--     note (the "article"/"thread" entity of Zammad and FreeScout). The emails
--     table stays the raw transport log, now for both directions.
--   * complete_ticket_reply(): records a sent reply, its outbound email, the
--     first-response time, the status change, the AI-draft link and the audit
--     row in one transaction.
--
-- Additive only: ticket_emails, auto_responses.sent/sent_at stay until the
-- contract migration so the currently deployed code keeps working.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ticket status workflow as data
-- ---------------------------------------------------------------------------

CREATE TABLE public.ticket_statuses (
  status     text PRIMARY KEY,
  is_open    boolean  NOT NULL,          -- counts toward queues, workload and SLA
  sort_order smallint NOT NULL UNIQUE
);

INSERT INTO public.ticket_statuses (status, is_open, sort_order) VALUES
  ('New',         true,  1),
  ('In Progress', true,  2),
  ('Pending',     true,  3),   -- waiting on the customer
  ('Resolved',    false, 4),   -- a customer reply reopens it
  ('Closed',      false, 5);   -- terminal: a customer reply starts a follow-up ticket

CREATE TABLE public.ticket_status_transitions (
  from_status text NOT NULL REFERENCES public.ticket_statuses (status) ON UPDATE CASCADE,
  to_status   text NOT NULL REFERENCES public.ticket_statuses (status) ON UPDATE CASCADE,
  PRIMARY KEY (from_status, to_status),
  CHECK (from_status <> to_status)
);

INSERT INTO public.ticket_status_transitions (from_status, to_status) VALUES
  ('New',         'In Progress'), ('New',         'Pending'), ('New',      'Resolved'), ('New',     'Closed'),
  ('In Progress', 'Pending'),     ('In Progress', 'Resolved'), ('In Progress', 'Closed'),
  ('Pending',     'In Progress'), ('Pending',     'Resolved'), ('Pending',  'Closed'),
  ('Resolved',    'In Progress'), ('Resolved',    'Closed');

-- The CHECK list is replaced by a foreign key to the lookup table.
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check1;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_status_fkey FOREIGN KEY (status)
  REFERENCES public.ticket_statuses (status) ON UPDATE CASCADE;
ALTER TABLE public.tickets ALTER COLUMN status SET DEFAULT 'New';

-- Status changes must follow the workflow, and the resolution timestamp is
-- owned by the database: set when a ticket leaves the open statuses, cleared
-- when it is reopened. No code path can leave them inconsistent.
CREATE OR REPLACE FUNCTION public.enforce_ticket_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_open boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT EXISTS (
    SELECT 1 FROM public.ticket_status_transitions
    WHERE from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'Ticket % cannot move from % to %', OLD.ticket_number, OLD.status, NEW.status
      USING ERRCODE = 'check_violation', HINT = 'invalid_status_transition';
  END IF;

  SELECT is_open INTO v_is_open FROM public.ticket_statuses WHERE status = NEW.status;
  IF v_is_open THEN
    NEW.sla_resolved_at := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Resolved -> Closed keeps the original resolution time.
    NEW.sla_resolved_at := COALESCE(OLD.sla_resolved_at, now());
  ELSE
    NEW.sla_resolved_at := COALESCE(NEW.sla_resolved_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_ticket_status
  BEFORE INSERT OR UPDATE OF status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_status();

-- A customer writing back after a ticket is Closed gets a new ticket that
-- points at the old one (self-referencing, same organization).
ALTER TABLE public.tickets
  ADD COLUMN follow_up_of uuid,
  ADD CONSTRAINT tickets_follow_up_of_fkey FOREIGN KEY (follow_up_of, organization_id)
    REFERENCES public.tickets (id, organization_id) ON DELETE SET NULL (follow_up_of),
  ADD CONSTRAINT tickets_follow_up_not_self CHECK (follow_up_of <> id);
CREATE INDEX tickets_follow_up_of_idx ON public.tickets (follow_up_of) WHERE follow_up_of IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. emails: the raw transport log, both directions
-- ---------------------------------------------------------------------------

ALTER TABLE public.emails
  ADD COLUMN direction text NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound', 'outbound')),
  -- Outbound mail is a record of something already sent; it never enters the intake queue.
  ADD CONSTRAINT emails_outbound_not_queued CHECK (direction = 'inbound' OR processed);

-- Target for the direction-checking foreign key below.
ALTER TABLE public.emails
  ADD CONSTRAINT emails_id_org_direction_key UNIQUE (id, organization_id, direction);

-- Threading looks replies up by Message-ID within one organization.
CREATE INDEX IF NOT EXISTS emails_org_message_id_idx
  ON public.emails (organization_id, message_id) WHERE message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. ticket_messages: the conversation
-- ---------------------------------------------------------------------------

CREATE TABLE public.ticket_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL,
  -- customer: inbound email; reply: public outbound email; note: internal, never emailed
  kind            text NOT NULL CHECK (kind IN ('customer', 'reply', 'note')),
  author_type     text NOT NULL CHECK (author_type IN ('customer', 'agent', 'ai')),
  author_user_id  uuid,
  email_id        uuid UNIQUE,              -- an email belongs to at most one message
  -- Which direction the linked email must have; derived from kind, so it can't disagree.
  email_direction text GENERATED ALWAYS AS (
    CASE kind WHEN 'customer' THEN 'inbound' WHEN 'reply' THEN 'outbound' END
  ) STORED,
  body_text       text NOT NULL CHECK (char_length(body_text) <= 100000),
  delivery_status text CHECK (delivery_status IN ('sending', 'sent', 'failed')),
  delivery_error  text CHECK (delivery_error IS NULL OR char_length(delivery_error) <= 1000),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ticket_messages_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT ticket_messages_ticket_fkey FOREIGN KEY (ticket_id, organization_id)
    REFERENCES public.tickets (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT ticket_messages_author_fkey FOREIGN KEY (author_user_id, organization_id)
    REFERENCES public.users (id, organization_id) ON DELETE SET NULL (author_user_id),
  -- Same organization AND the right direction: a customer message can only
  -- point at an inbound email, a reply only at an outbound one. NO ACTION: an
  -- email that is part of a conversation can't be deleted on its own (deleting
  -- the whole organization still cascades through both tables).
  CONSTRAINT ticket_messages_email_fkey FOREIGN KEY (email_id, organization_id, email_direction)
    REFERENCES public.emails (id, organization_id, direction),

  CONSTRAINT ticket_messages_kind_shape CHECK (
       (kind = 'customer' AND author_type = 'customer' AND delivery_status IS NULL)
    OR (kind = 'reply'    AND author_type IN ('agent', 'ai') AND delivery_status IS NOT NULL)
    OR (kind = 'note'     AND author_type = 'agent' AND delivery_status IS NULL AND email_id IS NULL)
  ),
  CONSTRAINT ticket_messages_user_only_for_agents CHECK (author_type = 'agent' OR author_user_id IS NULL),
  CONSTRAINT ticket_messages_error_only_when_failed CHECK (delivery_error IS NULL OR delivery_status = 'failed')
);

CREATE INDEX ticket_messages_ticket_idx ON public.ticket_messages (ticket_id, created_at);
CREATE INDEX ticket_messages_author_idx ON public.ticket_messages (author_user_id) WHERE author_user_id IS NOT NULL;

-- An AI draft points at the reply that was actually sent from it. The draft's
-- own text is left untouched, so the sent text vs. the AI's suggestion can be compared.
ALTER TABLE public.auto_responses
  ADD COLUMN sent_message_id uuid,
  ADD CONSTRAINT auto_responses_sent_message_fkey FOREIGN KEY (sent_message_id, organization_id)
    REFERENCES public.ticket_messages (id, organization_id) ON DELETE SET NULL (sent_message_id);
CREATE UNIQUE INDEX auto_responses_sent_message_key ON public.auto_responses (sent_message_id)
  WHERE sent_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Backfill existing conversations
-- ---------------------------------------------------------------------------

INSERT INTO public.ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text, created_at)
SELECT t.organization_id, te.ticket_id, 'customer', 'customer', e.id,
       left(e.body_text, 100000), COALESCE(e.received_at, e.created_at, now())
FROM public.ticket_emails te
JOIN public.emails e  ON e.id = te.email_id
JOIN public.tickets t ON t.id = te.ticket_id;

-- Sent drafts become reply messages. The sender is the user recorded on the
-- matching response_sent audit row; without one, the AI sent it automatically.
DO $$
DECLARE
  r record;
  v_message_id uuid;
BEGIN
  FOR r IN
    SELECT ar.id, ar.organization_id, ar.ticket_id, ar.response_text,
           COALESCE(ar.sent_at, ar.created_at, now()) AS sent_at,
           (SELECT u.id FROM public.audit_logs al
              JOIN public.users u ON u.id = al.actor_user_id AND u.organization_id = ar.organization_id
            WHERE al.action = 'response_sent' AND al.details ->> 'response_id' = ar.id::text
            ORDER BY al.created_at LIMIT 1) AS sender_id
    FROM public.auto_responses ar
    WHERE ar.sent
  LOOP
    INSERT INTO public.ticket_messages
      (organization_id, ticket_id, kind, author_type, author_user_id, body_text, delivery_status, created_at)
    VALUES
      (r.organization_id, r.ticket_id, 'reply',
       CASE WHEN r.sender_id IS NULL THEN 'ai' ELSE 'agent' END,
       r.sender_id, left(r.response_text, 100000), 'sent', r.sent_at)
    RETURNING id INTO v_message_id;

    UPDATE public.auto_responses SET sent_message_id = v_message_id WHERE id = r.id;
  END LOOP;
END;
$$;

-- Transition bridge (expand/contract): until the new pipeline is deployed, the
-- running code still links inbound mail through ticket_emails only. Mirror
-- those links into ticket_messages so nothing is missed in between. Dropped
-- together with ticket_emails in the contract migration.
CREATE OR REPLACE FUNCTION public.mirror_ticket_email_to_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ticket_messages (organization_id, ticket_id, kind, author_type, email_id, body_text, created_at)
  SELECT e.organization_id, NEW.ticket_id, 'customer', 'customer', e.id,
         left(e.body_text, 100000), COALESCE(e.received_at, now())
  FROM public.emails e
  WHERE e.id = NEW.email_id AND e.direction = 'inbound'
  ON CONFLICT (email_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mirror_ticket_email_to_message
  AFTER INSERT ON public.ticket_emails
  FOR EACH ROW EXECUTE FUNCTION public.mirror_ticket_email_to_message();

-- ---------------------------------------------------------------------------
-- 5. Recording a sent reply atomically
-- ---------------------------------------------------------------------------
-- Called after SMTP accepted the message (the reply row was inserted as
-- 'sending' before the send). Everything that follows from "this reply went
-- out" happens here in one transaction. A status that the workflow doesn't
-- allow is skipped rather than raised: the email has already been sent, so
-- recording it must not fail.

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
    SET sent = true, sent_at = now(), sent_message_id = p_message_id
    WHERE id = p_draft_id AND organization_id = p_org_id AND ticket_id = v_ticket.id AND sent_message_id IS NULL;
  END IF;

  INSERT INTO public.audit_logs (organization_id, ticket_id, action, details, performed_by, actor_user_id, actor_type)
  VALUES (
    p_org_id, v_ticket.id, 'reply_sent',
    jsonb_build_object('message_id', p_message_id, 'to', p_to_address, 'draft_id', p_draft_id,
                       'status', v_ticket.status, 'author', v_message.author_type),
    COALESCE(v_message.author_user_id::text, 'system'),
    v_message.author_user_id,
    CASE WHEN v_message.author_type = 'agent' THEN 'user' ELSE 'system' END
  );

  RETURN v_ticket;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lock down the new objects like every other table (see 006)
-- ---------------------------------------------------------------------------

ALTER TABLE public.ticket_statuses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ticket_statuses, public.ticket_status_transitions, public.ticket_messages
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_ticket_reply(uuid, uuid, text, text, text, text, text, text, text[], text, uuid),
                       public.enforce_ticket_status(), public.mirror_ticket_email_to_message()
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ticket_statuses, public.ticket_status_transitions, public.ticket_messages TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ticket_reply(uuid, uuid, text, text, text, text, text, text, text[], text, uuid)
  TO service_role;

COMMIT;

-- 012: Normalization, expand step. Everything here is additive or relaxes a
-- constraint, so the currently deployed code keeps working. 013 (contract)
-- drops the redundant columns once code that no longer uses them is live.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ticket numbers per organization
-- ---------------------------------------------------------------------------
-- One global sequence leaked each tenant's ticket volume to the others
-- (TKT-00031 then TKT-00087 means 55 tickets elsewhere). A counter row per
-- organization is incremented with an upsert: the row lock serializes
-- concurrent inserts within one organization only, and numbers are gap-free
-- except for rolled-back transactions.

CREATE TABLE public.ticket_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  last_number     integer NOT NULL CHECK (last_number >= 0)
);

INSERT INTO public.ticket_counters (organization_id, last_number)
SELECT organization_id, max(substring(ticket_number FROM '^TKT-(\d+)$')::int)
FROM public.tickets
WHERE ticket_number ~ '^TKT-\d+$'
GROUP BY organization_id;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    INSERT INTO public.ticket_counters AS c (organization_id, last_number)
    VALUES (NEW.organization_id, 1)
    ON CONFLICT (organization_id) DO UPDATE SET last_number = c.last_number + 1
    RETURNING last_number INTO v_next;
    NEW.ticket_number := 'TKT-' || lpad(v_next::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.tickets DROP CONSTRAINT tickets_ticket_number_key;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_org_number_key UNIQUE (organization_id, ticket_number);
DROP SEQUENCE IF EXISTS public.ticket_number_seq;

-- ---------------------------------------------------------------------------
-- 2. Knowledge-base citations as a relation
-- ---------------------------------------------------------------------------
-- auto_responses.cited_faq_ids was a text[] of ids: no foreign key (ids
-- could dangle after an article was deleted) and a repeating group (1NF).
-- A join table gives referential integrity and makes "how often is this
-- article used" a COUNT instead of a counter someone has to maintain.

-- Targets for the composite (tenant-safe) foreign keys below.
ALTER TABLE public.auto_responses ADD CONSTRAINT auto_responses_id_org_key UNIQUE (id, organization_id);
ALTER TABLE public.faqs           ADD CONSTRAINT faqs_id_org_key           UNIQUE (id, organization_id);

CREATE TABLE public.auto_response_citations (
  auto_response_id uuid     NOT NULL,
  faq_id           uuid     NOT NULL,
  organization_id  uuid     NOT NULL,
  rank             smallint NOT NULL CHECK (rank BETWEEN 1 AND 10),
  score            real     NOT NULL CHECK (score BETWEEN 0 AND 1),
  PRIMARY KEY (auto_response_id, faq_id),
  UNIQUE (auto_response_id, rank),
  FOREIGN KEY (auto_response_id, organization_id)
    REFERENCES public.auto_responses (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (faq_id, organization_id)
    REFERENCES public.faqs (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX auto_response_citations_faq_idx ON public.auto_response_citations (faq_id);

-- ---------------------------------------------------------------------------
-- 3. Customers
-- ---------------------------------------------------------------------------
-- One account per company domain per workspace, case-insensitively.
CREATE UNIQUE INDEX accounts_org_domain_key ON public.accounts (organization_id, lower(domain));

-- Contacts are scoped per workspace (007 added the per-org unique index);
-- the old global unique on email made one person unable to write to two
-- different companies using this product.
ALTER TABLE public.contacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_email_key;

-- users: lower(email) is already unique (007); the case-sensitive duplicate
-- constraint from 002 is redundant.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;

-- ---------------------------------------------------------------------------
-- 4. Workspace timezone
-- ---------------------------------------------------------------------------
-- "Resolved today" must start at midnight where the team works, not where
-- the server runs. The CHECK rejects names Postgres doesn't know.
ALTER TABLE public.organizations
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC'
    CHECK (now() AT TIME ZONE timezone IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 5. Audit log: append-only
-- ---------------------------------------------------------------------------
-- The service role can write anything, so immutability is enforced by the
-- database itself. Deliberate maintenance (retention, deleting a workspace)
-- must opt in for the transaction:  SET LOCAL intellidesk.audit_maintenance = 'on';

-- The one change allowed without it is referential: when a user or ticket
-- is deleted, its id is cleared from the audit row (ON DELETE SET NULL) and
-- nothing else changes.
CREATE OR REPLACE FUNCTION public.protect_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_expected public.audit_logs;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_expected := OLD;
    IF NEW.actor_user_id IS NULL THEN v_expected.actor_user_id := NULL; END IF;
    IF NEW.ticket_id IS NULL THEN v_expected.ticket_id := NULL; END IF;
    IF NEW IS NOT DISTINCT FROM v_expected THEN
      RETURN NEW;
    END IF;
  END IF;

  IF current_setting('intellidesk.audit_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'audit_logs is append-only (% refused)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Deleting a ticket used to delete its audit trail (ON DELETE CASCADE);
-- the history is kept now, with the ticket reference cleared.
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_ticket_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_ticket_fkey FOREIGN KEY (ticket_id, organization_id)
  REFERENCES public.tickets (id, organization_id) ON DELETE SET NULL (ticket_id);

CREATE TRIGGER protect_audit_log
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.protect_audit_log();

-- performed_by (text) duplicates actor_user_id + actor_type; new code stops
-- writing it, 013 drops it. Carry any user id it holds into the real column.
ALTER TABLE public.audit_logs ALTER COLUMN performed_by DROP NOT NULL;
SET LOCAL intellidesk.audit_maintenance = 'on';
UPDATE public.audit_logs a
SET actor_user_id = u.id, actor_type = 'user'
FROM public.users u
WHERE a.actor_user_id IS NULL
  AND a.performed_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND u.id = a.performed_by::uuid
  AND u.organization_id = a.organization_id;
RESET intellidesk.audit_maintenance;

-- ---------------------------------------------------------------------------
-- 6. Seeded tickets: record the AI verdict they were created with
-- ---------------------------------------------------------------------------
-- ai_confidence becomes derived from ai_classification in 013. Seed rows
-- carry the confidence without the verdict object; build it from the row.
UPDATE public.tickets
SET ai_classification = jsonb_build_object(
      'confidence', ai_confidence, 'category', category, 'severity', severity, 'summary', summary)
WHERE ai_classification IS NULL AND ai_confidence IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Lock down new objects (see 006)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ticket_counters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_response_citations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_counters, public.auto_response_citations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_audit_log() FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ticket_counters, public.auto_response_citations TO service_role;

COMMIT;

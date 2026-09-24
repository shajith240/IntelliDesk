-- 007: Referential integrity, tenant consistency, and the assignment model.
--
-- This is the "expand" half of an expand/contract change: everything here is
-- compatible with the application code that is currently deployed. Columns the
-- old code still writes (tickets.assigned_team, organizations.email_config,
-- audit_logs.performed_by) are kept and synchronised; they are removed by a later
-- contract migration once the new code is live.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Every tenant-owned row must belong to an organization.
--    (Verified before writing: zero NULL organization_id rows in each table.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tickets        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.emails         ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.faqs           ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.teams          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.accounts       ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.audit_logs     ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.auto_responses ALTER COLUMN organization_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Tenant-consistency keys. A composite (id, organization_id) key lets child
--    tables reference a parent *within the same organization*, so the database
--    itself rejects cross-tenant links instead of relying on application code.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users    ADD CONSTRAINT users_id_org_key    UNIQUE (id, organization_id);
ALTER TABLE public.teams    ADD CONSTRAINT teams_id_org_key    UNIQUE (id, organization_id);
ALTER TABLE public.tickets  ADD CONSTRAINT tickets_id_org_key  UNIQUE (id, organization_id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_id_org_key UNIQUE (id, organization_id);
ALTER TABLE public.emails   ADD CONSTRAINT emails_id_org_key   UNIQUE (id, organization_id);

ALTER TABLE public.teams ADD CONSTRAINT teams_org_name_key UNIQUE (organization_id, name);

-- Case-insensitive login identity (no collisions exist; verified).
CREATE UNIQUE INDEX users_email_lower_key ON public.users (lower(email));

-- ---------------------------------------------------------------------------
-- 3. Ticket assignee: TEXT -> UUID with a same-organization foreign key.
--    All 31 existing values are NULL, so the cast is lossless.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tickets
  ALTER COLUMN assigned_agent TYPE uuid USING NULLIF(assigned_agent, '')::uuid;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_assigned_agent_fkey
  FOREIGN KEY (assigned_agent, organization_id)
  REFERENCES public.users (id, organization_id)
  ON DELETE SET NULL (assigned_agent);

-- Only active admins/agents can hold tickets (viewers and disabled accounts cannot).
CREATE OR REPLACE FUNCTION public.enforce_ticket_assignee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_agent IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_agent IS DISTINCT FROM OLD.assigned_agent) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = NEW.assigned_agent
        AND u.organization_id = NEW.organization_id
        AND u.is_active
        AND u.role IN ('admin', 'agent')
    ) THEN
      RAISE EXCEPTION 'Assignee % is not an active admin or agent of this organization', NEW.assigned_agent
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_ticket_assignee
  BEFORE INSERT OR UPDATE OF assigned_agent ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_assignee();

-- ---------------------------------------------------------------------------
-- 4. Ticket team: add a real foreign key alongside the legacy text column.
--    Every existing name matches a team in the same organization (verified).
-- ---------------------------------------------------------------------------
ALTER TABLE public.tickets ADD COLUMN assigned_team_id uuid;

UPDATE public.tickets t
SET assigned_team_id = tm.id
FROM public.teams tm
WHERE tm.organization_id = t.organization_id
  AND tm.name = t.assigned_team;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_assigned_team_fkey
  FOREIGN KEY (assigned_team_id, organization_id)
  REFERENCES public.teams (id, organization_id)
  ON DELETE SET NULL (assigned_team_id);

-- Transitional sync so old code (writes the name) and new code (writes the id)
-- always leave both columns consistent. Removed in the contract migration.
CREATE OR REPLACE FUNCTION public.sync_ticket_team()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.assigned_team_id IS DISTINCT FROM OLD.assigned_team_id THEN
    IF NEW.assigned_team_id IS NULL THEN
      NEW.assigned_team := NULL;
    ELSE
      SELECT name INTO NEW.assigned_team FROM public.teams WHERE id = NEW.assigned_team_id;
    END IF;
  ELSIF NEW.assigned_team IS DISTINCT FROM OLD.assigned_team THEN
    IF NEW.assigned_team IS NULL THEN
      NEW.assigned_team_id := NULL;
    ELSE
      SELECT id INTO NEW.assigned_team_id FROM public.teams
      WHERE organization_id = NEW.organization_id AND name = NEW.assigned_team;
      IF NEW.assigned_team_id IS NULL THEN
        RAISE EXCEPTION 'Unknown team "%" for this organization', NEW.assigned_team
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_ticket_team
  BEFORE INSERT OR UPDATE OF assigned_team, assigned_team_id ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.sync_ticket_team();

-- ---------------------------------------------------------------------------
-- 5. Agent availability (distinct from is_active, which means "account enabled").
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN is_available boolean NOT NULL DEFAULT true;
UPDATE public.users SET is_active = true WHERE is_active IS NULL;
ALTER TABLE public.users ALTER COLUMN is_active SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Contacts belong to an organization directly (they were only reachable
--    through accounts, and two contacts had no account at all).
-- ---------------------------------------------------------------------------
ALTER TABLE public.contacts ADD COLUMN organization_id uuid
  REFERENCES public.organizations (id) ON DELETE CASCADE;

UPDATE public.contacts c SET organization_id = a.organization_id
FROM public.accounts a WHERE a.id = c.account_id AND c.organization_id IS NULL;

UPDATE public.contacts c SET organization_id = src.organization_id
FROM (SELECT DISTINCT ON (contact_id) contact_id, organization_id
      FROM public.tickets WHERE contact_id IS NOT NULL
      ORDER BY contact_id, created_at) src
WHERE src.contact_id = c.id AND c.organization_id IS NULL;

-- Old code inserts contacts without organization_id; derive it from the account.
CREATE OR REPLACE FUNCTION public.fill_contact_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.account_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.accounts WHERE id = NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fill_contact_org
  BEFORE INSERT OR UPDATE OF account_id, organization_id ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.fill_contact_org();

-- Per-tenant uniqueness (the global unique on email is dropped in the contract step).
CREATE UNIQUE INDEX contacts_org_email_key ON public.contacts (organization_id, lower(email));

-- ---------------------------------------------------------------------------
-- 7. SLA policies: allow per-organization overrides. Existing rows stay as the
--    global defaults (organization_id NULL), so current lookups are unchanged.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sla_policies ADD COLUMN organization_id uuid
  REFERENCES public.organizations (id) ON DELETE CASCADE;
ALTER TABLE public.sla_policies DROP CONSTRAINT sla_policies_severity_key;
ALTER TABLE public.sla_policies
  ADD CONSTRAINT sla_policies_org_severity_key UNIQUE NULLS NOT DISTINCT (organization_id, severity);
-- (sla_policies_severity_check already exists in this database.)
ALTER TABLE public.sla_policies
  ADD CONSTRAINT sla_policies_minutes_check CHECK (first_response_minutes > 0 AND resolution_minutes >= first_response_minutes);

-- ---------------------------------------------------------------------------
-- 8. Audit log actor: a real user reference instead of free text.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN actor_user_id uuid,
  ADD COLUMN actor_type text NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'user', 'cron', 'webhook'));
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_fkey
  FOREIGN KEY (actor_user_id, organization_id)
  REFERENCES public.users (id, organization_id)
  ON DELETE SET NULL (actor_user_id);

-- Audit rows referencing a ticket must reference one in the same organization.
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_ticket_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_ticket_fkey
  FOREIGN KEY (ticket_id, organization_id)
  REFERENCES public.tickets (id, organization_id)
  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. auto_responses and ticket_emails must stay within one organization.
-- ---------------------------------------------------------------------------
ALTER TABLE public.auto_responses DROP CONSTRAINT auto_responses_ticket_id_fkey;
ALTER TABLE public.auto_responses
  ADD CONSTRAINT auto_responses_ticket_fkey
  FOREIGN KEY (ticket_id, organization_id)
  REFERENCES public.tickets (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.ticket_emails
  ADD CONSTRAINT ticket_emails_ticket_email_key UNIQUE (ticket_id, email_id);

CREATE OR REPLACE FUNCTION public.enforce_ticket_email_same_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT organization_id FROM public.tickets WHERE id = NEW.ticket_id)
     IS DISTINCT FROM (SELECT organization_id FROM public.emails WHERE id = NEW.email_id) THEN
    RAISE EXCEPTION 'ticket_emails must link a ticket and an email from the same organization'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_ticket_email_same_org
  BEFORE INSERT OR UPDATE ON public.ticket_emails
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_email_same_org();

-- ---------------------------------------------------------------------------
-- 10. Assignment history and the single, atomic assignment write path.
-- ---------------------------------------------------------------------------
CREATE TABLE public.ticket_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL,
  assigned_to     uuid,
  assigned_by     uuid,
  note            text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (ticket_id, organization_id)
    REFERENCES public.tickets (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to, organization_id)
    REFERENCES public.users (id, organization_id) ON DELETE SET NULL (assigned_to),
  FOREIGN KEY (assigned_by, organization_id)
    REFERENCES public.users (id, organization_id) ON DELETE SET NULL (assigned_by)
);
CREATE INDEX ticket_assignments_ticket_idx ON public.ticket_assignments (ticket_id, created_at DESC);
CREATE INDEX ticket_assignments_assignee_idx ON public.ticket_assignments (organization_id, assigned_to);

-- Assigns (or unassigns, with p_assignee NULL) a ticket. Authorization is checked
-- here as well as in the API, so assignment can never bypass the admin rule, and
-- the ticket update, history row, and audit row commit or fail together.
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

  INSERT INTO public.audit_logs (organization_id, ticket_id, action, details, performed_by, actor_user_id, actor_type)
  VALUES (
    p_org_id, p_ticket_id,
    CASE WHEN p_assignee_id IS NULL THEN 'ticket_unassigned' ELSE 'ticket_assigned' END,
    jsonb_build_object('assigned_to', p_assignee_id, 'note', p_note),
    p_actor_id::text, p_actor_id, 'user'
  );

  RETURN v_ticket;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Mailbox connections: a proper table for each organization's inbox,
--     replacing the untyped organizations.email_config JSON. Secrets are stored
--     only as application-encrypted ciphertext (AES-256-GCM).
-- ---------------------------------------------------------------------------
CREATE TABLE public.mailbox_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL UNIQUE REFERENCES public.organizations (id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('gmail', 'imap_smtp')),
  email_address     text NOT NULL CHECK (email_address ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  username          text NOT NULL,
  imap_host         text NOT NULL,
  imap_port         integer NOT NULL CHECK (imap_port BETWEEN 1 AND 65535),
  smtp_host         text NOT NULL,
  smtp_port         integer NOT NULL CHECK (smtp_port BETWEEN 1 AND 65535),
  secret_ciphertext text NOT NULL,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  last_error        text CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  last_synced_at    timestamptz,
  connected_by      uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (connected_by, organization_id)
    REFERENCES public.users (id, organization_id) ON DELETE SET NULL (connected_by)
);

-- ---------------------------------------------------------------------------
-- 12. Login attempt log for brute-force throttling.
-- ---------------------------------------------------------------------------
CREATE TABLE public.auth_login_attempts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL,
  ip_address text,
  succeeded  boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_login_attempts_email_idx ON public.auth_login_attempts (lower(email), created_at DESC);
CREATE INDEX auth_login_attempts_ip_idx ON public.auth_login_attempts (ip_address, created_at DESC);

-- ---------------------------------------------------------------------------
-- 13. updated_at maintenance (migration 002 declared these, but they were never
--     applied to this database).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_mailbox_connections_updated_at BEFORE UPDATE ON public.mailbox_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 14. Indexes for foreign keys (Postgres does not create them automatically)
--     and for the queries the app runs on every page load.
-- ---------------------------------------------------------------------------
CREATE INDEX tickets_account_idx        ON public.tickets (account_id);
CREATE INDEX tickets_contact_idx        ON public.tickets (contact_id);
CREATE INDEX tickets_team_idx           ON public.tickets (assigned_team_id);
CREATE INDEX tickets_org_updated_idx    ON public.tickets (organization_id, updated_at DESC);
CREATE INDEX tickets_org_status_idx     ON public.tickets (organization_id, status);
CREATE INDEX tickets_org_assignee_idx   ON public.tickets (organization_id, assigned_agent) WHERE assigned_agent IS NOT NULL;
CREATE INDEX tickets_review_queue_idx   ON public.tickets (organization_id, created_at)
  WHERE assigned_agent IS NULL AND is_flagged_for_review AND status IN ('New', 'In Progress');
CREATE INDEX emails_org_received_idx    ON public.emails (organization_id, received_at DESC);
CREATE INDEX emails_message_id_idx      ON public.emails (organization_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX ticket_emails_email_idx    ON public.ticket_emails (email_id);
CREATE INDEX auto_responses_ticket_idx  ON public.auto_responses (ticket_id, created_at DESC);
CREATE INDEX audit_logs_org_created_idx ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_ticket_idx      ON public.audit_logs (ticket_id);
CREATE INDEX faqs_org_idx               ON public.faqs (organization_id);
CREATE INDEX teams_org_idx              ON public.teams (organization_id);
CREATE INDEX contacts_account_idx       ON public.contacts (account_id);
CREATE INDEX sla_policies_org_idx       ON public.sla_policies (organization_id);

-- ---------------------------------------------------------------------------
-- 15. Lock the new objects down the same way as the rest of the schema (006).
-- ---------------------------------------------------------------------------
ALTER TABLE public.ticket_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailbox_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ticket_assignments, public.mailbox_connections, public.auth_login_attempts
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_ticket(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_ticket_assignee(), public.sync_ticket_team(),
  public.fill_contact_org(), public.enforce_ticket_email_same_org() FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ticket_assignments, public.mailbox_connections, public.auth_login_attempts TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_ticket(uuid, uuid, uuid, uuid, text) TO service_role;

COMMIT;

-- IntelliDeskAI: Seed Admin User & Assign Orphaned Data
-- Migration 005: Create org "sharpflow", admin user, and reassign all existing data
-- Run this in Supabase SQL Editor AFTER 003_rls.sql and 004_email_config.sql

BEGIN;

-- 1. Create the organization
INSERT INTO organizations (name, slug, domain, plan, max_agents)
VALUES ('sharpflow', 'sharpflow', 'gmail.com', 'free', 1)
ON CONFLICT (slug) DO NOTHING;

-- 2. Create the admin user (password: Venkat@1984, bcrypt cost 12)
INSERT INTO users (organization_id, email, name, password_hash, role, is_active)
VALUES (
  (SELECT id FROM organizations WHERE slug = 'sharpflow'),
  'shajith4434@gmail.com',
  'Shajith',
  '$2b$12$EozSQj6T.MMBuOmjy3714O.Pfudp6MZN/ZTsCvWXawm5EP0VwjiLS',
  'admin',
  true
)
ON CONFLICT (email) DO NOTHING;

-- 3. Assign ALL orphaned data to the sharpflow organization
DO $$
DECLARE
  org_id UUID;
BEGIN
  SELECT id INTO org_id FROM organizations WHERE slug = 'sharpflow';

  -- Emails
  UPDATE emails SET organization_id = org_id WHERE organization_id IS NULL;

  -- Tickets
  UPDATE tickets SET organization_id = org_id WHERE organization_id IS NULL;

  -- Accounts (customers)
  UPDATE accounts SET organization_id = org_id WHERE organization_id IS NULL;

  -- Contacts: no organization_id column (scoped via account_id)

  -- FAQs
  UPDATE faqs SET organization_id = org_id WHERE organization_id IS NULL;

  -- Auto-responses
  UPDATE auto_responses SET organization_id = org_id WHERE organization_id IS NULL;

  -- Audit logs
  UPDATE audit_logs SET organization_id = org_id WHERE organization_id IS NULL;

  -- Teams
  UPDATE teams SET organization_id = org_id WHERE organization_id IS NULL;

  -- Ticket-email links (if the table has organization_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_emails' AND column_name = 'organization_id'
  ) THEN
    EXECUTE 'UPDATE ticket_emails SET organization_id = $1 WHERE organization_id IS NULL' USING org_id;
  END IF;

  RAISE NOTICE 'All orphaned data assigned to org: %', org_id;
END $$;

COMMIT;

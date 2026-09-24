-- IntelliDeskAI Row-Level Security
-- Migration 003: RLS policies for multi-tenant data isolation
-- Run this in Supabase SQL Editor AFTER 002_auth.sql

-- ==================== ENABLE RLS ====================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_emails ENABLE ROW LEVEL SECURITY;

-- ==================== NOTE ====================
-- The application uses supabase service_role key which BYPASSES RLS.
-- These policies are defense-in-depth for any future use of anon/user keys.
-- They also protect against accidental cross-org data leaks.

-- ==================== HELPER FUNCTION ====================
-- Helper function to get current user's organization_id.
-- Declared as SECURITY DEFINER to run as owner (superuser) and bypass RLS to prevent infinite recursion.
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ==================== ORGANIZATIONS ====================
-- Users can only see their own organization
DROP POLICY IF EXISTS "Users can view own org" ON organizations;
CREATE POLICY "Users can view own org"
  ON organizations FOR SELECT
  USING (id = public.get_user_org_id());

-- ==================== USERS ====================
-- Users can see other users in same org
DROP POLICY IF EXISTS "Users can view same org users" ON users;
CREATE POLICY "Users can view same org users"
  ON users FOR SELECT
  USING (organization_id = public.get_user_org_id());

-- ==================== ACCOUNTS ====================
DROP POLICY IF EXISTS "Org isolation for accounts" ON accounts;
CREATE POLICY "Org isolation for accounts"
  ON accounts FOR ALL
  USING (organization_id = public.get_user_org_id());

-- ==================== TICKETS ====================
DROP POLICY IF EXISTS "Org isolation for tickets" ON tickets;
CREATE POLICY "Org isolation for tickets"
  ON tickets FOR ALL
  USING (organization_id = public.get_user_org_id());

-- ==================== EMAILS ====================
DROP POLICY IF EXISTS "Org isolation for emails" ON emails;
CREATE POLICY "Org isolation for emails"
  ON emails FOR ALL
  USING (organization_id = public.get_user_org_id());

-- ==================== FAQS ====================
DROP POLICY IF EXISTS "Org isolation for faqs" ON faqs;
CREATE POLICY "Org isolation for faqs"
  ON faqs FOR ALL
  USING (organization_id = public.get_user_org_id());

-- ==================== AUDIT LOGS ====================
DROP POLICY IF EXISTS "Org isolation for audit_logs" ON audit_logs;
CREATE POLICY "Org isolation for audit_logs"
  ON audit_logs FOR ALL
  USING (organization_id = public.get_user_org_id());

-- ==================== TEAMS ====================
DROP POLICY IF EXISTS "Org isolation for teams" ON teams;
CREATE POLICY "Org isolation for teams"
  ON teams FOR ALL
  USING (organization_id = public.get_user_org_id());

-- ==================== AUTO RESPONSES ====================
DROP POLICY IF EXISTS "Org isolation for auto_responses" ON auto_responses;
CREATE POLICY "Org isolation for auto_responses"
  ON auto_responses FOR ALL
  USING (organization_id = public.get_user_org_id());

-- ==================== CONTACTS ====================
-- Contacts are scoped via their account's organization_id
DROP POLICY IF EXISTS "Org isolation for contacts" ON contacts;
CREATE POLICY "Org isolation for contacts"
  ON contacts FOR ALL
  USING (account_id IN (SELECT id FROM accounts WHERE organization_id = public.get_user_org_id()));

-- ==================== TICKET EMAILS ====================
-- ticket_emails are scoped via ticket's organization_id
DROP POLICY IF EXISTS "Org isolation for ticket_emails" ON ticket_emails;
CREATE POLICY "Org isolation for ticket_emails"
  ON ticket_emails FOR ALL
  USING (ticket_id IN (SELECT id FROM tickets WHERE organization_id = public.get_user_org_id()));

-- ==================== SLA POLICIES (GLOBAL) ====================
-- sla_policies stay readable by all (shared across orgs)
-- No RLS needed since they have no org_id column

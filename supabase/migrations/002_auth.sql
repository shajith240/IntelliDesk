-- IntelliDeskAI Auth & Multi-tenancy Schema
-- Migration 002: Users, Organizations, and role-based access
-- Run this in Supabase SQL Editor

-- ==================== ORGANIZATIONS ====================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  max_agents INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_domain ON organizations(domain);

-- ==================== USERS ====================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent', 'viewer')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_org ON users(organization_id);

-- ==================== ADD ORG REFERENCE TO EXISTING TABLES ====================

-- Add organization_id to accounts
ALTER TABLE accounts ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_accounts_org ON accounts(organization_id);

-- Add organization_id to tickets
ALTER TABLE tickets ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_tickets_org ON tickets(organization_id);

-- Add organization_id to emails
ALTER TABLE emails ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_emails_org ON emails(organization_id);

-- Add organization_id to faqs
ALTER TABLE faqs ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_faqs_org ON faqs(organization_id);

-- Add organization_id to audit_logs
ALTER TABLE audit_logs ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);

-- Add organization_id to teams
ALTER TABLE teams ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_teams_org ON teams(organization_id);

-- Add organization_id to auto_responses
ALTER TABLE auto_responses ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_auto_responses_org ON auto_responses(organization_id);

-- Add ai_classification JSONB column to tickets (from migrate endpoint)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_classification JSONB;

-- ==================== UPDATE TRIGGERS ====================

-- Auto-update updated_at for organizations
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at for users
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- IntelliDeskAI Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== ACCOUNTS ====================
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain TEXT NOT NULL,
  company_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('Gold', 'Silver', 'Bronze')),
  csm_name TEXT,
  csm_email TEXT,
  plan TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_accounts_domain ON accounts(domain);

-- ==================== CONTACTS ====================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT,
  department TEXT,
  phone TEXT,
  last_login TIMESTAMPTZ,
  subscribed_modules TEXT[] DEFAULT '{}',
  is_lead BOOLEAN DEFAULT FALSE,
  lead_status TEXT CHECK (lead_status IN ('new', 'contacted', 'qualified', 'converted')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_account ON contacts(account_id);

-- ==================== EMAILS ====================
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT[] DEFAULT '{}',
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_address TEXT NOT NULL DEFAULT '',
  cc TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  body_html TEXT,
  raw_headers JSONB,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  is_spam BOOLEAN DEFAULT FALSE,
  language TEXT,
  embedding_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_emails_message_id ON emails(message_id);
CREATE INDEX idx_emails_from ON emails(from_address);
CREATE INDEX idx_emails_processed ON emails(processed);

-- ==================== SLA POLICIES ====================
CREATE TABLE sla_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  severity TEXT NOT NULL UNIQUE CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  first_response_minutes INT NOT NULL,
  resolution_minutes INT NOT NULL
);

-- ==================== TEAMS ====================
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category_routing TEXT[] DEFAULT '{}'
);

-- ==================== TICKETS ====================
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'Resolved', 'Closed')),
  category TEXT,
  subcategory TEXT,
  severity TEXT NOT NULL DEFAULT 'P3' CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  ai_confidence REAL,
  subject TEXT NOT NULL DEFAULT '',
  summary TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_team TEXT,
  assigned_agent TEXT,
  sla_first_response_due TIMESTAMPTZ,
  sla_resolution_due TIMESTAMPTZ,
  sla_first_response_at TIMESTAMPTZ,
  sla_resolved_at TIMESTAMPTZ,
  sla_breach BOOLEAN DEFAULT FALSE,
  escalation_count INT DEFAULT 0,
  auto_response_sent BOOLEAN DEFAULT FALSE,
  auto_response_type TEXT CHECK (auto_response_type IN ('perfect', 'partial', 'none')),
  is_flagged_for_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tickets_number ON tickets(ticket_number);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_severity ON tickets(severity);
CREATE INDEX idx_tickets_account ON tickets(account_id);

-- ==================== TICKET EMAILS ====================
CREATE TABLE ticket_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('original', 'reply', 'forward', 'duplicate'))
);
CREATE INDEX idx_ticket_emails_ticket ON ticket_emails(ticket_id);
CREATE INDEX idx_ticket_emails_email ON ticket_emails(email_id);

-- ==================== FAQS ====================
CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL,
  solution_steps TEXT[] DEFAULT '{}',
  video_url TEXT,
  manual_ref TEXT,
  success_rate REAL DEFAULT 0.0,
  avg_resolution_minutes INT,
  times_used INT DEFAULT 0,
  embedding_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== AUTO RESPONSES ====================
CREATE TABLE auto_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  response_text TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('perfect', 'partial', 'none')),
  match_score REAL DEFAULT 0.0,
  cited_faq_ids TEXT[] DEFAULT '{}',
  cited_ticket_ids TEXT[] DEFAULT '{}',
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== AUDIT LOGS ====================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  performed_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_ticket ON audit_logs(ticket_id);

-- ==================== TICKET NUMBER SEQUENCE ====================
CREATE SEQUENCE ticket_number_seq START 1;

-- Function to generate ticket numbers
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number := 'TKT-' || LPAD(nextval('ticket_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticket_number
  BEFORE INSERT ON tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
  EXECUTE FUNCTION generate_ticket_number();

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==================== SEED SLA POLICIES ====================
INSERT INTO sla_policies (severity, first_response_minutes, resolution_minutes) VALUES
  ('P1', 60, 240),
  ('P2', 240, 480),
  ('P3', 1440, 4320),
  ('P4', 4320, 10080);

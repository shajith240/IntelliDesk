-- IntelliDeskAI Per-Org Email Configuration
-- Migration 004: Add email_config JSONB to organizations
-- Run this in Supabase SQL Editor AFTER 003_rls.sql

-- Add email_config column to organizations
-- Structure: { "imap": { "host": "...", "port": 993, "user": "...", "pass": "..." }, "smtp": { "host": "...", "port": 587, "user": "...", "pass": "..." } }
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email_config JSONB DEFAULT NULL;

COMMENT ON COLUMN organizations.email_config IS 'Per-org IMAP/SMTP config. If null, global env vars are used as fallback.';

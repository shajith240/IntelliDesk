-- 011: Per-workspace AI settings, bring-your-own AI key, and spam review.
--
-- * organizations.ai_auto_send: whether a confident knowledge-base answer may
--   be emailed without a person approving it. Off by default (drafts only),
--   the way Help Scout and Zendesk roll AI out. A 1:1 setting of the workspace,
--   so it is a column, not a separate table.
-- * ai_credentials: the workspace's own Gemini API key, encrypted like the
--   mailbox password (AES-256-GCM, organization id as associated data). The
--   secret has its own table so reading organizations never touches it.
-- * emails.not_spam_by / not_spam_at: an admin overrode the spam filter. The
--   pipeline then skips its spam checks for that email when reprocessing it.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN ai_auto_send boolean NOT NULL DEFAULT false;

CREATE TABLE public.ai_credentials (
  organization_id   uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  provider          text NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini')),
  secret_ciphertext text NOT NULL,
  -- Last four characters, so admins can tell which key is saved without seeing it.
  key_hint          text NOT NULL CHECK (char_length(key_hint) = 4),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
  last_error        text CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_credentials_created_by_fkey FOREIGN KEY (created_by, organization_id)
    REFERENCES public.users (id, organization_id) ON DELETE SET NULL (created_by),
  CONSTRAINT ai_credentials_error_only_when_failing CHECK (status = 'error' OR last_error IS NULL)
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.emails
  ADD COLUMN not_spam_by uuid,
  ADD COLUMN not_spam_at timestamptz,
  ADD CONSTRAINT emails_not_spam_by_fkey FOREIGN KEY (not_spam_by, organization_id)
    REFERENCES public.users (id, organization_id) ON DELETE SET NULL (not_spam_by),
  -- Both or neither (the user may later be deleted, which clears only the id).
  ADD CONSTRAINT emails_not_spam_pair CHECK (not_spam_by IS NULL OR not_spam_at IS NOT NULL);

-- The spam review list: newest suspected spam per organization.
CREATE INDEX emails_spam_review_idx ON public.emails (organization_id, received_at DESC)
  WHERE is_spam;

-- Auto-reply rate limiting counts recent outbound mail per recipient.
CREATE INDEX emails_outbound_recipient_idx ON public.emails (organization_id, to_address, created_at DESC)
  WHERE direction = 'outbound';

ALTER TABLE public.ai_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_credentials TO service_role;

COMMIT;

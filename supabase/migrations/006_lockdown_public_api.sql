-- 006: Close the public Data API.
--
-- The application reads and writes exclusively through the service-role key on
-- the server (src/server/db/supabase.ts). The anon key is public by design, and
-- before this migration the anon and authenticated roles held full privileges on
-- every table with row-level security disabled, so anyone holding the anon key
-- could read password hashes and mailbox credentials through PostgREST.
--
-- After this migration:
--   * RLS is enabled on every table with no permissive policies, so anon and
--     authenticated see nothing even if a grant is re-added by mistake.
--   * anon and authenticated hold no privileges on tables, sequences, or
--     functions in public, now or for objects created later.
--   * service_role keeps full access (it has BYPASSRLS), so the app is unaffected.

BEGIN;

-- Legacy prototype tables: unused by the application. Moved (not dropped) into a
-- schema that PostgREST does not expose, so the data is kept but unreachable.
CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;
ALTER TABLE IF EXISTS public.tickets_old SET SCHEMA archive;
ALTER TABLE IF EXISTS public.customers_old SET SCHEMA archive;
REVOKE ALL ON ALL TABLES IN SCHEMA archive FROM PUBLIC, anon, authenticated;

-- Enable RLS on every table in public (no policies = deny for non-bypass roles).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END
$$;

-- Remove any leftover policies from earlier experiments so nothing re-opens access.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END
$$;

-- Revoke existing privileges from the public-facing roles.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;

-- Make sure the service role (used by the app) keeps what it needs.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Future objects created by postgres must not be auto-granted to the public roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMIT;

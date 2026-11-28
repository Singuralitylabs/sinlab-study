-- =====================================================
-- Keepalive RPC for the Supabase Keepalive workflow (#591)
--
-- The daily workflow keeps the free-plan projects from auto-pausing by calling
-- the REST API with the publishable key (anon). Since #520 revoked every table
-- privilege from anon, its old target (SELECT on learning_themes) returns 401.
-- This function reads no table, so anon can call it without reopening tables.
-- =====================================================

CREATE FUNCTION public.keepalive()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 1;
$$;

-- Supabase's default privileges grant EXECUTE to anon and authenticated
-- explicitly, so revoking from PUBLIC alone is not enough.
REVOKE ALL ON FUNCTION public.keepalive() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.keepalive() TO anon, service_role;

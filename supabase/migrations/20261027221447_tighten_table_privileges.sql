-- =====================================================
-- Tighten table privileges (#520)
--
-- Supabase's default grants give anon and authenticated every table privilege
-- in public, so RLS is the only thing in the way. The app never reads or writes
-- tables as anon (pre-login pages only call auth, /demo uses service_role), and
-- the eight policy-less tables below are reached only through service_role.
-- Removing the grants keeps them closed if RLS is ever disabled or a policy is
-- added without a role. TRUNCATE ignores RLS, so authenticated loses it too.
--
-- Only defaults owned by postgres can be changed here (supabase_admin's need
-- that role); tables created by migrations are owned by postgres.
-- =====================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- The *_id_seq sequences of these tables keep authenticated's USAGE: revoking it
-- has no effect while the table itself is closed.
REVOKE ALL ON TABLE
  public.email_logs,
  public.cron_locks,
  public.stripe_events,
  public.push_subscriptions,
  public.push_logs,
  public.feedbacks,
  public.email_test_sends,
  public.ai_review_limit_resets
FROM authenticated;

-- Supabase advisor function_search_path_mutable.
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

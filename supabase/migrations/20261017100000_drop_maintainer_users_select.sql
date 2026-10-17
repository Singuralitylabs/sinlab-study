-- #414: Maintainers must not read users.email / notification_email via RLS.
-- Row-level policies cannot hide columns, so drop maintainer from users SELECT.
-- Manage UI paths that need other users' display_name use service_role (PR 1 / #416);
-- no non-PII view is added here — an unused security_invoker=false view would trip
-- Supabase Security Advisor (0010_security_definer_view) with no callers.

DROP POLICY IF EXISTS "Users can view own record, managers can view all" ON public.users;
CREATE POLICY "Users can view own record, admins can view all"
  ON public.users FOR SELECT TO authenticated
  USING (
    (auth_id = (select auth.uid()) AND is_deleted = false)
    OR (select get_user_role()) = 'admin'
  );

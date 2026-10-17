-- #414: Maintainers must not read users.email / notification_email via RLS.
-- Row-level policies cannot hide columns, so drop maintainer from users SELECT and
-- expose a non-PII view that runs with owner rights (security_invoker = false) and
-- only returns rows when the caller is a maintainer (get_user_role()).
-- security_invoker = true would re-apply users RLS and yield zero rows after the
-- policy change; document the owner-rights choice in docs/database.md §6.5.

CREATE OR REPLACE VIEW public.users_staff_view
WITH (security_invoker = false) AS
SELECT
  u.id,
  u.display_name,
  u.role,
  u.status,
  u.membership_type,
  u.is_deleted,
  u.created_at,
  u.updated_at,
  u.avatar_url,
  u.bio,
  u.onboarding_completed_at,
  u.terms_accepted_at
FROM public.users AS u
WHERE coalesce(u.is_deleted, false) = false
  AND (SELECT public.get_user_role()) = 'maintainer';

COMMENT ON VIEW public.users_staff_view IS
  'Non-PII user columns for maintainers (#414). Owner-rights view; rows only when get_user_role() = maintainer.';

REVOKE ALL ON public.users_staff_view FROM PUBLIC;
REVOKE ALL ON public.users_staff_view FROM anon;
GRANT SELECT ON public.users_staff_view TO authenticated;
GRANT SELECT ON public.users_staff_view TO service_role;

DROP POLICY IF EXISTS "Users can view own record, managers can view all" ON public.users;
CREATE POLICY "Users can view own record, admins can view all"
  ON public.users FOR SELECT TO authenticated
  USING (
    (auth_id = (select auth.uid()) AND is_deleted = false)
    OR (select get_user_role()) = 'admin'
  );

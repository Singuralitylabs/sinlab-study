-- Only fetchWeeklyFunnel() calls this, with service_role after an admin/maintainer
-- check. Any other EXECUTE lets a member POST the RPC.
-- Keep the 1..104 clamp: weeks is still caller-supplied, so generate_series stays bounded.
--
-- Supabase default privileges grant EXECUTE on new public functions to anon,
-- authenticated, and service_role. CREATE OR REPLACE keeps the ACL, but
-- DROP FUNCTION + CREATE does not. Recreating get_weekly_funnel without repeating
-- this REVOKE lets authenticated call it again.

REVOKE EXECUTE ON FUNCTION public.get_weekly_funnel(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO service_role;

-- RETURNS trigger, so PostgREST does not expose it, but default privileges still
-- leave EXECUTE for authenticated. Revoke that too so the ACL matches the docs.
REVOKE ALL ON FUNCTION public.stamp_stripe_subscription_funnel_times() FROM authenticated;

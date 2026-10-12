-- fetchWeeklyFunnel() is the only caller, and it uses service_role after an
-- admin/maintainer check. EXECUTE for authenticated let any member POST the
-- RPC (five correlated subqueries per week, up to 104). Match
-- claim_email_test_send: service_role only.
--
-- The 1..104 clamp inside get_weekly_funnel stays. It bounded generate_series
-- because authenticated could call the function; a service_role key can still
-- pass weeks, so the clamp remains that bound.

REVOKE EXECUTE ON FUNCTION public.get_weekly_funnel(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO service_role;

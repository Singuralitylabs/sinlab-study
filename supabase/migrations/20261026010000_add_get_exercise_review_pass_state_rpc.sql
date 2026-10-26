-- =====================================================
-- get_exercise_review_pass_state RPC (#502)
--
-- Exercise content pages called three round-trips in parallel:
-- content_requires_review_pass, content_review_pass_unachievable,
-- and a submissions/ai_reviews SELECT for a passing review.
-- Fold them into one INVOKER RPC for the page path only.
--
-- Logic is unchanged: the two DEFINER helpers still gate on
-- content_visible_to_caller + learning_content_* (no rubric body).
-- has_passing_review uses the caller's RLS on submissions / ai_reviews.
-- Keep the existing two RPCs for progress API, certificates, triggers.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_exercise_review_pass_state(p_content_id INTEGER)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'requires_pass', public.content_requires_review_pass(p_content_id),
    'pass_unachievable', public.content_review_pass_unachievable(p_content_id),
    'has_passing_review', EXISTS (
      SELECT 1
      FROM public.submissions AS s
      INNER JOIN public.ai_reviews AS r ON r.submission_id = s.id
      WHERE s.user_id = public.get_user_id()
        AND s.content_id = p_content_id
        AND r.status = 'completed'
        AND r.passed IS TRUE
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_exercise_review_pass_state(INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exercise_review_pass_state(INTEGER)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_exercise_review_pass_state(INTEGER) IS
  'Exercise page pass-gate state in one round-trip (#502): requires_pass, pass_unachievable, has_passing_review. No rubric body.';

-- reference_answer is shown only after the learner has submitted, but a column grant let any
-- signed-in learner read it over REST before submitting. Re-issue the grant from
-- 20261012170000_hide_grading_rubric_column.sql without it; learners read it through
-- get_exercise_reference_answer(). service_role keeps its table grant (admin client, AI review).
REVOKE SELECT ON TABLE public.learning_contents FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  allowed_submission_types,
  code_language,
  content_type,
  created_at,
  description,
  display_order,
  exercise_instructions,
  hint,
  id,
  is_deleted,
  is_open_to_trial,
  is_published,
  pdf_url,
  text_content,
  title,
  updated_at,
  video_url,
  week_id
) ON TABLE public.learning_contents TO anon, authenticated;

-- Returns the model answer only when the content is visible to the caller and, for learners, the
-- caller has at least one submission for it. admin / maintainer preview unpublished content, so
-- they need no submission. Any other case returns zero rows.
CREATE OR REPLACE FUNCTION public.get_exercise_reference_answer(p_content_id INTEGER)
RETURNS TABLE (reference_answer TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT lc.reference_answer
  FROM learning_contents lc
  INNER JOIN learning_weeks lw ON lw.id = lc.week_id
  INNER JOIN learning_phases lp ON lp.id = lw.phase_id
  INNER JOIN learning_themes lt ON lt.id = lp.theme_id
  WHERE lc.id = p_content_id
    AND lc.content_type = 'exercise'
    AND lc.is_deleted = false
    AND lc.reference_answer IS NOT NULL
    AND (
      get_user_role() IN ('admin', 'maintainer')
      OR (
        lc.is_published = true
        AND lw.is_published = true AND lw.is_deleted = false
        AND lp.is_published = true AND lp.is_deleted = false
        AND lt.is_published = true AND lt.is_deleted = false
        AND CASE get_user_status()
          WHEN 'active' THEN true
          WHEN 'trial' THEN lc.is_open_to_trial
          ELSE false
        END
        AND EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.content_id = lc.id AND s.user_id = get_user_id()
        )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_exercise_reference_answer(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exercise_reference_answer(INTEGER) TO authenticated, service_role;

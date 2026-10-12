-- Column-level REVOKE does not hide grading_rubric while the role still holds table-level
-- SELECT: PostgreSQL allows the column if either privilege exists. Drop table SELECT for the
-- learner roles and grant every column except grading_rubric. INSERT/UPDATE/DELETE stay.
-- service_role keeps its table grant so the admin client can still select the column.
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
  reference_answer,
  text_content,
  title,
  updated_at,
  video_url,
  week_id
) ON TABLE public.learning_contents TO anon, authenticated;

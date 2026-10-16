-- Certificate checks need "does this exercise have a live rubric?" without selecting
-- grading_rubric. Learners have no SELECT on that column, and a service_role read of the
-- body on the progress / review / certificates path would be a new learner-triggered copy
-- of the marking guide. This stored boolean is only the non-empty check (NULL and tombstones
-- are false). Generated columns are computed on write, so learners never see requirement text.

ALTER TABLE public.learning_contents
  ADD COLUMN IF NOT EXISTS has_grading_requirements BOOLEAN
  GENERATED ALWAYS AS (
    CASE
      WHEN jsonb_typeof(grading_rubric -> 'requirements') = 'array'
        AND jsonb_array_length(grading_rubric -> 'requirements') > 0
      THEN true
      ELSE false
    END
  ) STORED;

COMMENT ON COLUMN public.learning_contents.has_grading_requirements IS
  '採点基準の requirements が1件以上なら true。NULL と墓石（空配列）は false。修了判定が本文を読まずに使う';

-- A new column is invisible until it is added to the column grant (table SELECT was revoked).
REVOKE SELECT ON TABLE public.learning_contents FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  allowed_submission_types,
  code_language,
  content_type,
  created_at,
  description,
  display_order,
  exercise_instructions,
  has_grading_requirements,
  hint,
  id,
  is_deleted,
  is_open_to_trial,
  is_published,
  pdf_url,
  starter_files,
  submission_file_slots,
  text_content,
  title,
  updated_at,
  video_url,
  week_id
) ON TABLE public.learning_contents TO anon, authenticated;

-- Exercise submission layout (filename + language, no starter content). NULL means the app
-- resolves one file from code_language (or from starter_files when that column already names
-- files). Shape is checked in the app (zod); this CHECK only keeps the column off non-exercises,
-- same as grading_rubric. A new learner-facing column is invisible until it is added to the
-- column grant (table SELECT was revoked).

ALTER TABLE public.learning_contents
  ADD COLUMN IF NOT EXISTS submission_file_slots JSONB;

COMMENT ON COLUMN public.learning_contents.submission_file_slots IS
  '演習の提出ファイル構成 [{filename, language}]。NULL は未指定（code_language の既定ファイル1つ。starter_files があるときはそのファイル名・言語）';

ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_submission_file_slots_exercise_only_check;

ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_submission_file_slots_exercise_only_check
  CHECK (content_type = 'exercise' OR submission_file_slots IS NULL);

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
  starter_files,
  submission_file_slots,
  text_content,
  title,
  updated_at,
  video_url,
  week_id
) ON TABLE public.learning_contents TO anon, authenticated;

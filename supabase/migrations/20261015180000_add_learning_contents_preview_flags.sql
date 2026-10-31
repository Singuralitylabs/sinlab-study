-- Exercise preview / console toggles (#380). NULL means the app decides from the file layout,
-- so existing rows keep working without a backfill. Non-exercises must stay NULL, same as
-- grading_rubric. A new learner-facing column is invisible until it is added to the column
-- grant (table SELECT was revoked).

ALTER TABLE public.learning_contents
  ADD COLUMN IF NOT EXISTS show_preview BOOLEAN,
  ADD COLUMN IF NOT EXISTS show_console BOOLEAN;

COMMENT ON COLUMN public.learning_contents.show_preview IS
  '演習のライブプレビュー。NULL はファイル構成からの自動（#380）';
COMMENT ON COLUMN public.learning_contents.show_console IS
  '演習のプレビューコンソール。NULL はファイル構成からの自動（#380）';

ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_preview_flags_exercise_only_check;

ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_preview_flags_exercise_only_check
  CHECK (
    content_type = 'exercise'
    OR (show_preview IS NULL AND show_console IS NULL)
  );

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
  show_console,
  show_preview,
  starter_files,
  submission_file_slots,
  text_content,
  title,
  updated_at,
  video_url,
  week_id
) ON TABLE public.learning_contents TO anon, authenticated;

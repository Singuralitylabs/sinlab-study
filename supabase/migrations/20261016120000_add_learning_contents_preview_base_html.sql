-- =====================================================
-- learning_contents.preview_base_html（#351）
--
-- CSS 単独提出のプレビュー用土台 HTML。受講生は提出せず、管理者が登録する。
-- NULL は未設定（CSS だけの演習は従来どおりプレビュー不可）。
-- 受講生向け列なので GRANT SELECT に含める（table SELECT は REVOKE 済み）。
-- =====================================================

ALTER TABLE public.learning_contents
  ADD COLUMN IF NOT EXISTS preview_base_html TEXT;

COMMENT ON COLUMN public.learning_contents.preview_base_html IS
  'CSS 単独提出のプレビュー土台 HTML（#351）。NULL は未設定';

ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_preview_base_html_exercise_only_check;

ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_preview_base_html_exercise_only_check
  CHECK (
    content_type = 'exercise'
    OR preview_base_html IS NULL
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
  has_grading_requirements,
  hint,
  id,
  is_deleted,
  is_open_to_trial,
  is_published,
  pdf_url,
  preview_base_html,
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

-- Exercise starter code shown in the learner submission form (not secret; unlike reference_answer).
-- Shape matches submissions.code_files: [{ filename, language, content }].

ALTER TABLE learning_contents
  ADD COLUMN IF NOT EXISTS starter_files JSONB;

COMMENT ON COLUMN learning_contents.starter_files IS
  '演習の初期コード [{filename, language, content}]。NULL は初期コードなし（提出フォームは空ファイル1つから開始）';

-- Column grants replaced the table SELECT; new learner-facing columns must be granted explicitly.
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
  text_content,
  title,
  updated_at,
  video_url,
  week_id
) ON TABLE public.learning_contents TO anon, authenticated;

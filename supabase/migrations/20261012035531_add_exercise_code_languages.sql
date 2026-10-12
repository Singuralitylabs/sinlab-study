-- =====================================================
-- learning_contents.code_language の CHECK 制約に
-- 'sql' / 'bash' / 'markdown' / 'python' / 'json' を追加 (#307)
--
-- Web開発スキル講座・AI駆動開発の基礎・開発ツール入門の演習で、SQL・シェル・
-- Markdown・Python・JSON を提出する課題がある。既定言語をこれらにできるよう許可値を増やす。
--
-- 既存5値（javascript / typescript / gas / html / css）はそのまま許可し続ける。
-- 許可値の正はアプリの CODE_LANGUAGES（app/components/code-editor-utils.ts）で、ここと揃える。
-- DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT のため再実行しても安全（既存レコードの値は変更しない）。
-- =====================================================

ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_code_language_check;

ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_code_language_check
  CHECK (code_language IN (
    'javascript', 'typescript', 'gas', 'html', 'css',
    'sql', 'bash', 'markdown', 'python', 'json'
  ));

COMMENT ON COLUMN public.learning_contents.code_language IS
  'コードエディタの既定言語（exercise時）。javascript / typescript / gas / html / css / sql / bash / markdown / python / json。GAS（.gs）はJavaScriptベースだが提出フォームと同様に別言語として扱う';

-- =====================================================
-- learning_contents.code_language の CHECK 制約に 'yaml' を追加 (#551)
--
-- 開発ツール入門の演習で、設定ファイル（compose.yaml など）を YAML で提出する課題がある。
-- 既存10値はそのまま許可し続ける。
-- 許可値の正はアプリの CODE_LANGUAGES（app/components/code-editor-utils.ts）で、ここと揃える。
-- DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT のため再実行しても安全（既存レコードの値は変更しない）。
-- =====================================================

ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_code_language_check;

ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_code_language_check
  CHECK (code_language IN (
    'javascript', 'typescript', 'gas', 'html', 'css',
    'sql', 'bash', 'markdown', 'python', 'json', 'yaml'
  ));

COMMENT ON COLUMN public.learning_contents.code_language IS
  'コードエディタの既定言語（exercise時）。javascript / typescript / gas / html / css / sql / bash / markdown / python / json / yaml。GAS（.gs）はJavaScriptベースだが提出フォームと同様に別言語として扱う';

-- =====================================================
-- learning_contents.code_language の CHECK 制約に 'gas' を追加 (#56)
--
-- 課題提出フォームでは GAS（.gs）を JavaScript（.js）と分離済み（#57）だが、
-- 管理画面が設定する既定言語 code_language は CHECK 制約により 'gas' を
-- 保存できず、既定言語を GAS にできなかった。
--
-- 既存4値（javascript / typescript / html / css）はそのまま許可し続け、
-- 'gas' を追加するのみ。DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT のため
-- 再実行しても安全（既存レコードの値は変更しない）。
-- =====================================================

ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_code_language_check;

ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_code_language_check
  CHECK (code_language IN ('javascript', 'typescript', 'gas', 'html', 'css'));

COMMENT ON COLUMN public.learning_contents.code_language IS
  'コードエディタの既定言語（exercise時）。javascript / typescript / gas / html / css。GAS（.gs）はJavaScriptベースだが提出フォームと同様に別言語として扱う';

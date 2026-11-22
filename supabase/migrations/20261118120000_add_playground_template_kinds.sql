-- 「コードを試す」のひな形に Markdown・JSON・YAML・ターミナルを追加する（#583）
-- 許可する値は app/constants/playground.ts の PLAYGROUND_KINDS と揃える。

ALTER TABLE public.playground_templates
  DROP CONSTRAINT IF EXISTS playground_templates_kind_check;

ALTER TABLE public.playground_templates
  ADD CONSTRAINT playground_templates_kind_check
  CHECK (kind IN ('web', 'python', 'sql', 'markdown', 'json', 'yaml', 'terminal'));

COMMENT ON COLUMN public.playground_templates.kind IS '種類（web / python / sql / markdown / json / yaml / terminal）';

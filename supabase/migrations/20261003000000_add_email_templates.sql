-- =====================================================
-- メール文面の管理画面での編集 (#286)
--
-- email_templates: テンプレートキーごとの件名・本文（Markdown）の上書き。1キー1行。
--   行が無いキーはコード側の既定値（app/lib/email-template.ts）で送る。
--   「既定に戻す」は行の削除。送信側は service_role で読み、読めなければ既定値で送る。
-- email_settings.service_name / service_subtitle: 差出人名・件名の接頭辞・見出し・フッターの名前。
--   既定値はコードの EMAIL_SERVICE_NAME / EMAIL_SERVICE_SUBTITLE と同じ。
-- email_test_sends: 管理画面のテスト送信の記録（1日の回数上限の集計用）。
--   email_logs には記録しないため、案内系メールの1日の上限の集計に影響しない。
--
-- RLS: email_templates は SELECT / INSERT / UPDATE / DELETE とも admin のみ（同一操作は1本）。
--   email_test_sends はポリシーを作らない（service_role のみ）。
-- =====================================================

CREATE TABLE IF NOT EXISTS public.email_templates (
  template_key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.email_templates IS
  'メール文面の上書き（件名・本文）。行が無いキーはコードの既定値で送る。許可キー・プレースホルダーはアプリ側（app/lib/email-template.ts）で検証する';
COMMENT ON COLUMN public.email_templates.template_key IS
  'テンプレートキー（signup / trial_nurture.day2 など。アプリ側の EMAIL_TEMPLATE_KEYS と同じ値）';
COMMENT ON COLUMN public.email_templates.body IS '本文（Markdown。{{placeholder}} を差し込める）';

ALTER TABLE public.email_settings
  ADD COLUMN IF NOT EXISTS service_name TEXT NOT NULL DEFAULT 'Sinlab Study',
  ADD COLUMN IF NOT EXISTS service_subtitle TEXT DEFAULT 'AIと学ぶ実践Web技術講座';

COMMENT ON COLUMN public.email_settings.service_name IS
  'メールの差出人名・件名の接頭辞・本文の見出し・フッターのサービス名';
COMMENT ON COLUMN public.email_settings.service_subtitle IS
  'メールの見出しの補足・フッターに添える名前（講座名）。NULL は補足なし';

CREATE TABLE IF NOT EXISTS public.email_test_sends (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_test_sends IS
  '管理画面のテスト送信の記録（1日の回数上限の集計用。email_logs とは別で、案内系の上限に影響しない）';

CREATE INDEX IF NOT EXISTS email_test_sends_created_at_idx
  ON public.email_test_sends (created_at);
CREATE INDEX IF NOT EXISTS email_test_sends_user_id_idx
  ON public.email_test_sends (user_id);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_test_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view email templates" ON public.email_templates;
CREATE POLICY "Admins can view email templates"
  ON public.email_templates FOR SELECT
  USING ((select get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Admins can insert email templates" ON public.email_templates;
CREATE POLICY "Admins can insert email templates"
  ON public.email_templates FOR INSERT
  WITH CHECK ((select get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Admins can update email templates" ON public.email_templates;
CREATE POLICY "Admins can update email templates"
  ON public.email_templates FOR UPDATE
  USING ((select get_user_role()) = 'admin')
  WITH CHECK ((select get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Admins can delete email templates" ON public.email_templates;
CREATE POLICY "Admins can delete email templates"
  ON public.email_templates FOR DELETE
  USING ((select get_user_role()) = 'admin');

-- =====================================================
-- 修了証 (#291)
--
-- certificates: テーマ修了時に自動発行する修了証。1テーマ1枚（UNIQUE (user_id, theme_id)）。
--   recipient_name / theme_name は発行時点のスナップショット（後から名前やテーマ名を変えても、
--   発行済みの修了証は変わらない）。certificate_no は将来の公開検証ページに使えるよう一意にする。
--   発行は service_role 経路（POST /api/progress の完了直後）のみ。user_id は本人に固定する。
-- email_kind_settings: 種別 certificate_issued（修了証の発行メール）を追加する。
--
-- RLS: SELECT は本人または admin / maintainer（OR で1本）。INSERT / UPDATE / DELETE の
--   ポリシーは作らない（受講生・管理画面からは書き込めない）。
-- =====================================================

CREATE TABLE IF NOT EXISTS public.certificates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  theme_id INTEGER NOT NULL REFERENCES public.learning_themes(id) ON DELETE CASCADE,
  certificate_no TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  theme_name TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT certificates_user_theme_unique UNIQUE (user_id, theme_id),
  CONSTRAINT certificates_certificate_no_unique UNIQUE (certificate_no),
  CONSTRAINT certificates_certificate_no_format
    CHECK (certificate_no ~ '^SS-[0-9]{6}-[0-9A-Z]{6}$')
);

COMMENT ON TABLE public.certificates IS
  'テーマ修了証。1テーマ1枚。発行は service_role のみ（POST /api/progress の完了直後）。受講生からの INSERT / UPDATE / DELETE は不可';
COMMENT ON COLUMN public.certificates.certificate_no IS
  '証明番号 SS-YYYYMM-XXXXXX（YYYYMM は発行月 JST）。一意。将来の公開検証ページ用';
COMMENT ON COLUMN public.certificates.recipient_name IS
  '発行時点の users.display_name のスナップショット（将来、修了証用の氏名を別に設定できる余地として別カラムにしている）';
COMMENT ON COLUMN public.certificates.theme_name IS
  '発行時点の learning_themes.name のスナップショット';

CREATE INDEX IF NOT EXISTS certificates_theme_id_idx ON public.certificates (theme_id);
CREATE INDEX IF NOT EXISTS certificates_user_id_issued_at_idx
  ON public.certificates (user_id, issued_at DESC);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner or managers can view certificates" ON public.certificates;
CREATE POLICY "Owner or managers can view certificates"
  ON public.certificates FOR SELECT
  USING (
    user_id = (select get_user_id())
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

INSERT INTO public.email_kind_settings (kind, enabled, send_days, send_weekday) VALUES
  ('certificate_issued', true, NULL, NULL)
ON CONFLICT (kind) DO NOTHING;

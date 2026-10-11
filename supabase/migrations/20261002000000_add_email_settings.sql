-- =====================================================
-- メール通知の管理設定 (#272)
--
-- email_kind_settings: 種別（EMAIL_KIND）ごとの有効・無効と送信タイミング。1種別1行。
--   案内系（weekly_digest / inactivity_reminder / trial_nurture / announcement）は Cron が
--   実行のたびに読み、読めなければ送らない（フェイルクローズ）。
--   トランザクション系は送信前に enabled を読み、読めなければ既定値（有効）で送る。
-- email_settings: 案内系メールの1日の上限。id = 1 の1行のみ。
--
-- 初期値は #253 時点の定数（INACTIVITY_REMINDER_DAYS / TRIAL_NURTURE_DAYS /
-- EMAIL_DIGEST_MAX_PER_DAY）と同じにし、適用直後の挙動を変えない。
-- 繰り越し予約（weekly_digest_reserved）は送信種別ではないので含めない。
--
-- RLS: SELECT / UPDATE は admin のみ（同一操作は1本）。INSERT / DELETE のポリシーは作らない。
-- Cron とメール送信は service_role で読む。
-- =====================================================

CREATE TABLE IF NOT EXISTS public.email_kind_settings (
  kind TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  send_days INTEGER[],
  send_weekday SMALLINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT email_kind_settings_send_weekday_range
    CHECK (send_weekday IS NULL OR send_weekday BETWEEN 0 AND 6),
  CONSTRAINT email_kind_settings_send_days_size
    CHECK (send_days IS NULL OR cardinality(send_days) BETWEEN 1 AND 10)
);

COMMENT ON TABLE public.email_kind_settings IS
  'メール種別ごとの有効・無効と送信タイミング。案内系は Cron が実行ごとに読みフェイルクローズ、トランザクション系は読めなければ有効扱い';
COMMENT ON COLUMN public.email_kind_settings.kind IS
  'メール種別（アプリ側の EMAIL_KIND と同じ値。weekly_digest_reserved は含めない）';
COMMENT ON COLUMN public.email_kind_settings.send_days IS
  '登録から N 日目（inactivity_reminder / trial_nurture のみ使用）。昇順・重複なし';
COMMENT ON COLUMN public.email_kind_settings.send_weekday IS
  '週次進捗の送信曜日 0=日曜〜6=土曜（weekly_digest のみ使用）';

CREATE TABLE IF NOT EXISTS public.email_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  digest_daily_limit INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT email_settings_single_row CHECK (id = 1),
  CONSTRAINT email_settings_digest_daily_limit_range CHECK (digest_daily_limit BETWEEN 1 AND 95)
);

COMMENT ON TABLE public.email_settings IS
  'メール通知の共通設定（1行のみ）。Resend 無料枠の日次 100 通未満に収めるため上限は 95 まで';
COMMENT ON COLUMN public.email_settings.digest_daily_limit IS
  '案内系メールの1日（JST）の送信上限（実行をまたいだ合計）';

INSERT INTO public.email_kind_settings (kind, enabled, send_days, send_weekday) VALUES
  ('signup', true, NULL, NULL),
  ('approved', true, NULL, NULL),
  ('upgraded', true, NULL, NULL),
  ('cancel_scheduled', true, NULL, NULL),
  ('subscription_ended', true, NULL, NULL),
  ('weekly_digest', true, NULL, 1),
  ('inactivity_reminder', true, ARRAY[7, 14], NULL),
  ('trial_nurture', true, ARRAY[2, 5, 7, 14], NULL),
  ('announcement', true, NULL, NULL)
ON CONFLICT (kind) DO NOTHING;

INSERT INTO public.email_settings (id, digest_daily_limit) VALUES (1, 80)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.email_kind_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view email kind settings" ON public.email_kind_settings;
CREATE POLICY "Admins can view email kind settings"
  ON public.email_kind_settings FOR SELECT
  USING ((select get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Admins can update email kind settings" ON public.email_kind_settings;
CREATE POLICY "Admins can update email kind settings"
  ON public.email_kind_settings FOR UPDATE
  USING ((select get_user_role()) = 'admin')
  WITH CHECK ((select get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Admins can view email settings" ON public.email_settings;
CREATE POLICY "Admins can view email settings"
  ON public.email_settings FOR SELECT
  USING ((select get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Admins can update email settings" ON public.email_settings;
CREATE POLICY "Admins can update email settings"
  ON public.email_settings FOR UPDATE
  USING ((select get_user_role()) = 'admin')
  WITH CHECK ((select get_user_role()) = 'admin');

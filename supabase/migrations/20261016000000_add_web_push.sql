-- =====================================================
-- Web Push（#301 段階 B）
--
-- push_subscriptions: ブラウザ購読。endpoint はブラウザ単位で一意。
--   404 / 410 を返した購読は disabled_at を記録し、以後送らない。
-- push_logs: email_logs と同じ claim。送信前に INSERT し、
--   UNIQUE (user_id, kind, reference_key) 違反なら送らない。
-- email_kind_settings.push_enabled: チャネルの有効・無効だけを分ける。
--   送る日・曜日・上限は既存列のまま（プッシュ用の別設定は持たない）。既定は無効。
--
-- RLS は有効化し、ポリシーは作らない。読み書きは getServerAuth() 済みの API から
-- service_role で user_id を固定する。email_kind_settings の admin ポリシーは既存のまま
-- （管理画面のトグルは通常クライアント）。
-- =====================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ,
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push の購読。service_role 専用（RLS 有効・ポリシーなし）。user_id は認証済み API が固定する';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'Push サービスのエンドポイント。ブラウザ単位で一意';
COMMENT ON COLUMN public.push_subscriptions.disabled_at IS
  '送信先が 404 / 410 を返した日時。NULL の行だけ送る';

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS public.push_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  reference_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_logs_user_kind_reference_key UNIQUE (user_id, kind, reference_key)
);

COMMENT ON TABLE public.push_logs IS
  'Web Push の送信ログ。送信前の INSERT を claim とし、UNIQUE (user_id, kind, reference_key) で二重送信を防ぐ。service_role 専用';
COMMENT ON COLUMN public.push_logs.kind IS
  'approved / inactivity_reminder / trial_nurture / announcement';
COMMENT ON COLUMN public.push_logs.reference_key IS
  '同一事象の識別子（承認時刻・dayN・お知らせ ID）。メールの email_logs と同じキー';
COMMENT ON COLUMN public.push_logs.sent_at IS
  '1件以上の購読へ送れれば記録。claim 直後・失敗時は NULL';
COMMENT ON COLUMN public.push_logs.error IS
  '失敗の概要。秘密鍵やエンドポイントは入れない';

ALTER TABLE public.email_kind_settings
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.email_kind_settings.push_enabled IS
  'この種別を Web Push でも送るか。既定 false。送る日・曜日・上限はメールと同じ列を使う';

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_logs ENABLE ROW LEVEL SECURITY;

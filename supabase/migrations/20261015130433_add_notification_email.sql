-- =====================================================
-- users に通知の送り先と、確認が済むまでの待ち情報を追加 (#379)
--
-- users.email（ログイン用。Google から写したもの）は変えない。
-- notification_email が NULL のときはログイン用アドレスへ送る。
-- 確認リンクを開いて確定するまで notification_email は更新しない。
-- トークンは SHA-256 のハッシュだけを保存する（平文は保存しない）。
--
-- 書き込みは設定 API と確認ルートが service_role で本人の行だけ行う。
-- 受講者が自分の users 行を更新する RLS は足さない（既存の UPDATE は admin のみ）。
-- 既存行はすべて NULL のまま。列の追加だけで、既存の値は書き換えない。
-- =====================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS notification_email_pending VARCHAR(255),
  ADD COLUMN IF NOT EXISTS notification_email_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS notification_email_expires_at TIMESTAMPTZ;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_notification_email_pending_complete;

ALTER TABLE public.users
  ADD CONSTRAINT users_notification_email_pending_complete CHECK (
    (
      notification_email_pending IS NULL
      AND notification_email_token_hash IS NULL
      AND notification_email_expires_at IS NULL
    )
    OR (
      notification_email_pending IS NOT NULL
      AND notification_email_token_hash IS NOT NULL
      AND notification_email_expires_at IS NOT NULL
    )
  );

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_notification_email_not_blank;

ALTER TABLE public.users
  ADD CONSTRAINT users_notification_email_not_blank CHECK (
    (notification_email IS NULL OR length(notification_email) > 0)
    AND (notification_email_pending IS NULL OR length(notification_email_pending) > 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS users_notification_email_token_hash_key
  ON public.users (notification_email_token_hash)
  WHERE notification_email_token_hash IS NOT NULL;

COMMENT ON COLUMN public.users.notification_email IS
  '通知の送り先。NULL はログイン用の users.email に送る。確認が済むまで書き換わらない';
COMMENT ON COLUMN public.users.notification_email_pending IS
  '確認待ちの送り先。確認が済むか取り消すか期限切れで消すまで、notification_email は変えない';
COMMENT ON COLUMN public.users.notification_email_token_hash IS
  '確認トークンの SHA-256 ハッシュ。平文は保存しない。1回使ったら NULL に戻す';
COMMENT ON COLUMN public.users.notification_email_expires_at IS
  '確認トークンの有効期限。期限を過ぎたトークンでは切り替えない';

-- 確認メールの送信回数を、ユーザー単位のロックの中で数えてから email_logs に claim する。
-- 同時リクエストでも上限を超えない。上限に達していれば NULL を返す（行は足さない）。
-- 種別はアプリの NOTIFICATION_EMAIL_LOG_KIND.CONFIRM と同じ文字列。
CREATE OR REPLACE FUNCTION public.claim_notification_email_confirm(
  p_user_id INTEGER,
  p_reference_key TEXT,
  p_since TIMESTAMPTZ,
  p_limit INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('notification_email_confirm'), p_user_id);
  IF (
    SELECT count(*)
    FROM public.email_logs
    WHERE user_id = p_user_id
      AND kind = 'notification_email_confirm'
      AND created_at >= p_since
  ) >= p_limit THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.email_logs (user_id, kind, reference_key)
  VALUES (p_user_id, 'notification_email_confirm', p_reference_key)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notification_email_confirm(INTEGER, TEXT, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_confirm(INTEGER, TEXT, TIMESTAMPTZ, INTEGER)
  TO service_role;

-- =====================================================
-- 受講生向けメール通知の送信ログ (#252)
--
-- email_logs: トランザクションメール（登録・承認・有料会員化・解約予約・有料会員終了）の
-- 送信記録。送信前に行を INSERT して処理権（claim）とし、
-- UNIQUE (user_id, kind, reference_key) の一意制約違反なら送信しない（stripe_events の
-- claim と同じパターン）。これにより Webhook と /upgrade/success の両経路・Webhook の
-- 再送・順序逆転で同一事象のメールが複数届くことを防ぐ。
-- 送信失敗時は error を記録して行を残す（Phase 1 では再送しない）。
--
-- RLS を有効化し、ポリシーは作成しない（service_role からのみ読み書きする。
-- 受講生・管理画面からは参照しない）。
-- =====================================================

CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- アプリ側の定数（EMAIL_KIND）で管理し、Phase 2 以降の種別追加に追従できるよう CHECK 制約は設けない
  kind TEXT NOT NULL,
  reference_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_logs_user_kind_reference_key UNIQUE (user_id, kind, reference_key)
);

COMMENT ON TABLE email_logs IS
  '受講生向けメールの送信ログ。送信前のINSERTを処理権のclaimとして使い、UNIQUE (user_id, kind, reference_key) で同一事象の二重送信を防ぐ。service_role専用';
COMMENT ON COLUMN email_logs.kind IS
  'メール種別（signup / approved / upgraded / cancel_scheduled / subscription_ended）';
COMMENT ON COLUMN email_logs.reference_key IS
  '同一事象の識別子（users.id・承認時刻・stripe_subscription_id など種別ごとに異なる）';
COMMENT ON COLUMN email_logs.sent_at IS
  '送信に成功した日時。claim直後・送信失敗時はNULL';
COMMENT ON COLUMN email_logs.error IS
  '送信に失敗した場合のエラー内容（APIキー等の秘匿情報は含めない）';

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Cron バッチの実行ロック cron_locks を追加 (#253)
--
-- 定期メールの日次バッチ（GET /api/cron/email-digest）は、Vercel Cron の
-- 重複起動や手動実行で並行して動くことがある。name を主キーとする行の
-- INSERT を処理権（claim）とし、主キー違反なら別の実行が進行中として
-- 何もしない（claimCheckoutSlot() と同じ claim パターン）。終了時に自分が
-- 取った行（locked_at が一致する行）を削除して解放する。
-- 関数のハードタイムアウト等で解放されなかった行は、アプリ側の TTL
-- （EMAIL_DIGEST_LOCK_TTL_MS）を過ぎたら削除して取り直す。
--
-- RLS を有効化し、ポリシーは作成しない（service_role からのみ読み書きする）。
-- =====================================================

CREATE TABLE IF NOT EXISTS cron_locks (
  name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE cron_locks IS
  'Cron バッチの実行ロック。name の INSERT を処理権の claim とし、並行実行を防ぐ。service_role専用';
COMMENT ON COLUMN cron_locks.locked_at IS
  'ロックを取った日時。解放は自分が取った行（この値が一致する行）だけを削除し、TTL を過ぎた行は取り直せる';

ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;

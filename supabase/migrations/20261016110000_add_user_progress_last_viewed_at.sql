-- =====================================================
-- user_progress.last_viewed_at（#396）
--
-- コンテンツ詳細を開いた時刻。続きから学習の基準と「前回」表示に使う。
-- NULL 可。完了 / 完了解除の upsert はこの列を送らない（消さない）。
-- 閲覧だけの行が増えても inactivity 判定は ever_completed / submissions 側で絞る。
-- =====================================================

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_progress.last_viewed_at IS
  'コンテンツ詳細を最後に開いた時刻。NULL は未記録。続きから学習（#396）の基準';

-- =====================================================
-- user_progress.retry_started_at（#355）
--
-- 演習の「再度課題に取り組む」中かどうか。NULL でなければ再挑戦開始時刻。
-- 最新提出の submitted_at がこの時刻以前なら再挑戦中（画面が模範回答と
-- AI レビューを隠す）。新しい提出があれば自動的に再挑戦中でなくなる。
-- 完了列（is_completed / completed_at / ever_completed）は触らない。
-- =====================================================

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS retry_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_progress.retry_started_at IS
  '演習の再挑戦開始時刻。NULL は再挑戦していない。最新提出がこの時刻以前なら再挑戦中';

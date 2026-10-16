-- =====================================================
-- announcements.push_sent_at（#301）
--
-- Web Push のお知らせ完了印。email_sent_at と独立させ、メール完了後に
-- deliverDigestPushes が落ちても翌日 push_sent_at IS NULL で再試行できる。
-- 既存のメール完了行は push_sent_at = email_sent_at で埋め、過去のお知らせを
-- 新規購読者へ積まない。
-- =====================================================

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.announcements.push_sent_at IS
  'Web Push の一斉送信を終えた日時。NULL は未完了。対象変更で NULL に戻す。email_sent_at とは独立';

UPDATE public.announcements
SET push_sent_at = email_sent_at
WHERE email_sent_at IS NOT NULL
  AND push_sent_at IS NULL;

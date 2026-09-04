-- =====================================================
-- learning_contents にお試し公開フラグを追加 (#86)
--
-- お試し（trial）ユーザー（status='pending'）にも公開するコンテンツを
-- 個別に指定できるようにする。デフォルトは非公開（false）。
-- =====================================================

ALTER TABLE learning_contents
  ADD COLUMN IF NOT EXISTS is_open_to_trial BOOLEAN NOT NULL DEFAULT false;

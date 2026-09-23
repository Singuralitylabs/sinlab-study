-- =====================================================
-- users にオンボーディング完了日時カラムを追加 (#16)
--
-- 初回利用ガイド（ウェルカムダイアログ）の表示済み状態を
-- 記録する。初回 1 回だけ表示し、閉じたときに時刻を保存する。
-- 既存ユーザーは NULL のまま、リリース後の初回訪問時に
-- 1 回表示する（バックフィルは行わない）。
--
-- RLS の変更は不要（更新は POST /api/onboarding/complete が
-- service_role 経由で行い、本人 SELECT は既存ポリシーで許可済み）。
-- 稼働中DB・新規セットアップの双方に対して、このファイルが
-- onboarding_completed_at カラムの唯一の定義箇所となる。
-- ADD COLUMN IF NOT EXISTS により、複数回適用しても安全。
-- =====================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.onboarding_completed_at IS
  '初回利用ガイド（ウェルカムダイアログ）の完了日時。閉じたときに記録し、既存ユーザーは NULL のまま';

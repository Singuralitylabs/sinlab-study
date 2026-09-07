-- =====================================================
-- users.status の 'pending' を 'trial' へリネーム (#88)
--
-- #86 でお試しユーザー機能を追加した際、影響範囲を抑えるため新設フラグ
-- （is_open_to_trial）とUI文言のみ trial 系の名称とし、DB値は 'pending' の
-- ままとしていた。「お試しユーザー = status='pending'」という命名の二重管理を
-- 解消するため、本マイグレーションでDB値も 'trial' に統一する。
--
-- 制約名 users_status_check は 20260412010000_create_tables.sql の
-- インラインCHECKからPostgresが自動命名したもの。
-- DROP → UPDATE → ADD の順で適用する（逆順だと制約違反になる）。
--
-- ai_reviews.status の 'pending'（AIレビューのジョブ状態）は別概念のため対象外。
--
-- 【重要】本マイグレーションはアプリコードの USER_STATUS.TRIAL への切り替えと
-- 同時にリリースすること。旧コードが動いたまま本マイグレーションのみ適用すると、
-- 新規ログイン時の INSERT（status='pending'）がCHECK制約違反で失敗する。
-- =====================================================

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;

ALTER TABLE public.users ALTER COLUMN status SET DEFAULT 'trial';

UPDATE public.users SET status = 'trial' WHERE status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_status_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('trial', 'active', 'rejected'));
  END IF;
END $$;

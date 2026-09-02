-- =====================================================
-- 却下ユーザーの権限剥奪 (#104)
--
-- get_user_role() が status を見ていなかったため、却下（status='rejected'）後も
-- 却下前に付与されていた admin / maintainer ロールを保持したままとなり、
-- Auth セッション（JWT）が有効な限り API・RLS の双方で認可を突破できた。
--
-- get_user_status() は 02_rls/003_trial_user_policies.sql で定義されており、
-- 本ファイル（01_schema）より後に適用される。定義順の問題を避けるため
-- get_user_status() には依存せず、status = 'active' 条件を関数本体に
-- 直接組み込む。
--
-- CREATE OR REPLACE FUNCTION は同一シグネチャであれば既存の権限設定
-- （02_rls/002_consolidate_rls_policies.sql での EXECUTE の REVOKE/GRANT）を
-- 引き継ぐため、権限の再設定は不要。
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role::text FROM users
  WHERE auth_id = auth.uid() AND is_deleted = false AND status = 'active'
  LIMIT 1;
$$;

-- =====================================================
-- 却下ユーザーの権限剥奪 (#104)
--
-- get_user_role() が status を見ていなかったため、却下（status='rejected'）後も
-- 却下前に付与されていた admin / maintainer ロールを保持したままとなり、
-- Auth セッション（JWT）が有効な限り API・RLS の双方で認可を突破できた。
--
-- status = 'active' ではなく status <> 'rejected' とする（pending も含めて
-- ロールを返す）。アプリ層（getServerAuth() / 各APIルート）は元々 rejected
-- のみを弾く設計であり、ここを 'active' 限定にすると pending の
-- admin/maintainer（サブスク失効等で active から pending に戻ったユーザー）が
-- アプリ層は通過するのに RLS 側だけロール無しになり、書き込みが原因不明の
-- エラー・無言のno-opになる新たな不整合を生む。却下ユーザーの権限剥奪という
-- 本issueのスコープに限定するため <> 'rejected' を採用する。
--
-- get_user_status() は 20260801000002_trial_user_policies.sql で定義されており、
-- 本ファイルより先に適用されるが、関数間の依存を増やさないよう
-- get_user_status() には依存せず、条件を関数本体に直接組み込む。
--
-- CREATE OR REPLACE FUNCTION は同一シグネチャであれば既存の権限設定
-- （20260715233228_consolidate_rls_policies.sql での EXECUTE の REVOKE/GRANT）を
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
  WHERE auth_id = auth.uid() AND is_deleted = false AND status <> 'rejected'
  LIMIT 1;
$$;

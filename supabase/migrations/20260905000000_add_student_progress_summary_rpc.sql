-- =====================================================
-- 受講生進捗集計のDB側集約 (#83)
--
-- fetchStudentsProgress()（app/services/api/admin-server.ts）は従来、
-- user_progress の完了済み全行を1000行ずつページングしてアプリ側で
-- ユーザー単位に集計していた。受講生・完了行数の増加に比例して転送量・
-- リクエスト回数が増え、offsetページング途中の行更新で集計がずれる
-- 余地もあった。GROUP BY user_id によるDB側集約に置き換える。
--
-- SECURITY DEFINER は使わない（docs/database.md 5.2 のRLSヘルパー関数とは
-- 異なる方針。5.2 の規約はポリシーから呼ぶRLSヘルパーに限る）。
-- 本関数はプレーンな SQL 関数（デフォルトの SECURITY INVOKER）とし、
-- 呼び出し元の権限のまま user_progress の既存RLS
-- （20260715233228_consolidate_rls_policies.sql の
--  "Users can view own progress, managers can view all":
--  user_id = (select get_user_id()) OR (select get_user_role()) IN ('admin', 'maintainer')）
-- に従わせる。これにより:
--   - /manage/students 経由（admin/maintainer）で呼ぶと全受講生分が返る
--   - member が直接RPCを呼んでも、RLSがフィルタするため本人の1行しか
--     返らず、他人の進捗は取得できない
-- という性質がRPC側のロールチェックなしに成立する。
--
-- ORDER BY user_id を付けるのは、PostgRESTの db-max-rows（既定1000行）が
-- 通常のテーブル同様この関数の返り値にも適用されるため。呼び出し側
-- （fetchStudentsProgress）は user_progress の旧実装と同様に .range() で
-- ページングしており、その安定した順序保証に必要。
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_students_progress_summary()
RETURNS TABLE (
  user_id INTEGER,
  completed_count BIGINT,
  last_activity TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT user_id, count(*) AS completed_count, max(completed_at) AS last_activity
  FROM public.user_progress
  WHERE is_completed = true
  GROUP BY user_id
  ORDER BY user_id;
$$;

-- 既存ヘルパー関数と同じ規約（PUBLIC, anon からのREST RPC実行を禁止）。
-- SECURITY INVOKER のためRLSは効くが、未認証（anon）からの実行自体は
-- 許可しない。
REVOKE EXECUTE ON FUNCTION public.get_students_progress_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_students_progress_summary() TO authenticated, service_role;

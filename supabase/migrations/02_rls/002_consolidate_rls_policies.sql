-- =====================================================
-- RLSポリシーの統合とinitplan最適化 (#77)
--
-- Supabase Performance Advisor の警告に対応する:
-- 1. multiple_permissive_policies:
--    ロール別（Admin/Maintainer/一般）に分かれていた同一操作の
--    許可ポリシーを OR 条件で1ポリシーに統合する
-- 2. auth_rls_initplan:
--    get_user_role() / get_user_id() / auth.uid() を (select ...) で包み、
--    行ごとの再評価を防いでクエリ実行時に1回だけ評価（InitPlan化）させる
-- 3. セキュリティ警告対応 (anon_security_definer_function_executable):
--    get_user_role() / get_user_id() の anon ロールからの EXECUTE を revoke
--
-- 権限の意味（各ロールがアクセスできる範囲）は従来と変更しない。
-- =====================================================

-- =====================================================
-- learning_themes ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Published themes are viewable by authenticated users" ON learning_themes;
DROP POLICY IF EXISTS "Admins can view all themes" ON learning_themes;
DROP POLICY IF EXISTS "Maintainers can view all themes" ON learning_themes;
CREATE POLICY "Themes are viewable by users or content managers"
  ON learning_themes FOR SELECT TO authenticated
  USING (
    (is_published = true AND is_deleted = false)
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Admins can insert themes" ON learning_themes;
DROP POLICY IF EXISTS "Maintainers can insert themes" ON learning_themes;
CREATE POLICY "Content managers can insert themes"
  ON learning_themes FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Admins can update themes" ON learning_themes;
DROP POLICY IF EXISTS "Maintainers can update themes" ON learning_themes;
CREATE POLICY "Content managers can update themes"
  ON learning_themes FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Admins can delete themes" ON learning_themes;
DROP POLICY IF EXISTS "Maintainers can delete themes" ON learning_themes;
CREATE POLICY "Content managers can delete themes"
  ON learning_themes FOR DELETE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

-- =====================================================
-- learning_phases ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Published phases are viewable by authenticated users" ON learning_phases;
DROP POLICY IF EXISTS "Admins can view all phases" ON learning_phases;
DROP POLICY IF EXISTS "Maintainers can view all phases" ON learning_phases;
CREATE POLICY "Phases are viewable by users or content managers"
  ON learning_phases FOR SELECT TO authenticated
  USING (
    (is_published = true AND is_deleted = false)
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Admins can insert phases" ON learning_phases;
DROP POLICY IF EXISTS "Maintainers can insert phases" ON learning_phases;
CREATE POLICY "Content managers can insert phases"
  ON learning_phases FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Admins can update phases" ON learning_phases;
DROP POLICY IF EXISTS "Maintainers can update phases" ON learning_phases;
CREATE POLICY "Content managers can update phases"
  ON learning_phases FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Admins can delete phases" ON learning_phases;
DROP POLICY IF EXISTS "Maintainers can delete phases" ON learning_phases;
CREATE POLICY "Content managers can delete phases"
  ON learning_phases FOR DELETE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

-- =====================================================
-- learning_weeks ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Published weeks are viewable by authenticated users" ON learning_weeks;
DROP POLICY IF EXISTS "Admins can view all weeks" ON learning_weeks;
DROP POLICY IF EXISTS "Maintainers can view all weeks" ON learning_weeks;
CREATE POLICY "Weeks are viewable by users or content managers"
  ON learning_weeks FOR SELECT TO authenticated
  USING (
    (is_published = true AND is_deleted = false)
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Admins can insert weeks" ON learning_weeks;
DROP POLICY IF EXISTS "Maintainers can insert weeks" ON learning_weeks;
CREATE POLICY "Content managers can insert weeks"
  ON learning_weeks FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Admins can update weeks" ON learning_weeks;
DROP POLICY IF EXISTS "Maintainers can update weeks" ON learning_weeks;
CREATE POLICY "Content managers can update weeks"
  ON learning_weeks FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Admins can delete weeks" ON learning_weeks;
DROP POLICY IF EXISTS "Maintainers can delete weeks" ON learning_weeks;
CREATE POLICY "Content managers can delete weeks"
  ON learning_weeks FOR DELETE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

-- =====================================================
-- learning_contents ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Published contents are viewable by authenticated users" ON learning_contents;
DROP POLICY IF EXISTS "Admins can view all contents" ON learning_contents;
DROP POLICY IF EXISTS "Maintainers can view all contents" ON learning_contents;
CREATE POLICY "Contents are viewable by users or content managers"
  ON learning_contents FOR SELECT TO authenticated
  USING (
    (is_published = true AND is_deleted = false)
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Admins can insert contents" ON learning_contents;
DROP POLICY IF EXISTS "Maintainers can insert contents" ON learning_contents;
CREATE POLICY "Content managers can insert contents"
  ON learning_contents FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Admins can update contents" ON learning_contents;
DROP POLICY IF EXISTS "Maintainers can update contents" ON learning_contents;
CREATE POLICY "Content managers can update contents"
  ON learning_contents FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Admins can delete contents" ON learning_contents;
DROP POLICY IF EXISTS "Maintainers can delete contents" ON learning_contents;
CREATE POLICY "Content managers can delete contents"
  ON learning_contents FOR DELETE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

-- =====================================================
-- users ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Users can view own record" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Maintainers can view all users" ON users;
CREATE POLICY "Users can view own record, managers can view all"
  ON users FOR SELECT TO authenticated
  USING (
    (auth_id = (select auth.uid()) AND is_deleted = false)
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Authenticated users can insert own record" ON users;
CREATE POLICY "Authenticated users can insert own record"
  ON users FOR INSERT TO authenticated
  WITH CHECK (auth_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can update users" ON users;
CREATE POLICY "Admins can update users"
  ON users FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'admin');

-- =====================================================
-- user_progress ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Users can view own progress" ON user_progress;
DROP POLICY IF EXISTS "Admins can view all progress" ON user_progress;
CREATE POLICY "Users can view own progress, admins can view all"
  ON user_progress FOR SELECT TO authenticated
  USING (
    user_id = (select get_user_id())
    OR (select get_user_role()) = 'admin'
  );

DROP POLICY IF EXISTS "Users can insert own progress" ON user_progress;
CREATE POLICY "Users can insert own progress"
  ON user_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = (select get_user_id()));

DROP POLICY IF EXISTS "Users can update own progress" ON user_progress;
CREATE POLICY "Users can update own progress"
  ON user_progress FOR UPDATE TO authenticated
  USING (user_id = (select get_user_id()));

-- =====================================================
-- submissions ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Users can view own submissions" ON submissions;
DROP POLICY IF EXISTS "Admins can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Maintainers can view all submissions" ON submissions;
CREATE POLICY "Users can view own submissions, managers can view all"
  ON submissions FOR SELECT TO authenticated
  USING (
    user_id = (select get_user_id())
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Users can insert own submissions" ON submissions;
CREATE POLICY "Users can insert own submissions"
  ON submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = (select get_user_id()));

-- =====================================================
-- ai_reviews ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Users can view own ai reviews" ON ai_reviews;
DROP POLICY IF EXISTS "Admins can view all ai reviews" ON ai_reviews;
DROP POLICY IF EXISTS "Maintainers can view all ai reviews" ON ai_reviews;
CREATE POLICY "Users can view own ai reviews, managers can view all"
  ON ai_reviews FOR SELECT TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM submissions WHERE user_id = (select get_user_id())
    )
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

-- =====================================================
-- RLSヘルパー関数の EXECUTE 権限
-- =====================================================
-- anon（未認証）からの REST RPC 経由の実行を防ぐ。
-- PUBLIC へのデフォルト付与も取り消す（anon が PUBLIC 経由で
-- 実行可能なままになるのを防ぐため）。
-- RLSポリシーの評価には実行ロール（authenticated）の EXECUTE 権限が
-- 必要なため、authenticated / service_role への GRANT は維持する。

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_id() TO authenticated, service_role;

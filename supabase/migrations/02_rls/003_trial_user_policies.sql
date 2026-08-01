-- =====================================================
-- お試し（trial）ユーザー向けRLS強化 (#86)
--
-- get_user_role() / get_user_id() と同じパターンで get_user_status() を追加し、
-- learning_contents の SELECT をお試しユーザー（status='pending'）は
-- お試し公開分（is_open_to_trial=true）のみに制限する。
-- user_progress / submissions の書き込み（INSERT/UPDATE）にも
-- 可視コンテンツ限定の EXISTS 条件を追加し、お試し非公開コンテンツへの
-- 進捗・提出の書き込みを防ぐ。
--
-- 親階層（learning_themes/learning_phases/learning_weeks）はステータス不問で
-- 従来どおり公開分を閲覧可のため対象外（コースツリーの骨格は全ユーザーに見せる）。
-- =====================================================

-- =====================================================
-- get_user_status() ヘルパー関数
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_status()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT status::text FROM users WHERE auth_id = auth.uid() AND is_deleted = false LIMIT 1;
$$;

-- anon（未認証）からの REST RPC 経由の実行を防ぐ（get_user_role() / get_user_id() と同様）
REVOKE EXECUTE ON FUNCTION public.get_user_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_status() TO authenticated, service_role;

-- =====================================================
-- learning_contents: SELECT をお試しユーザー制限付きに差し替え
-- =====================================================

DROP POLICY IF EXISTS "Contents are viewable by users or content managers" ON learning_contents;
CREATE POLICY "Contents are viewable by users or content managers"
  ON learning_contents FOR SELECT TO authenticated
  USING (
    (
      is_published = true AND is_deleted = false
      AND (
        (select get_user_status()) = 'active'
        OR ((select get_user_status()) = 'pending' AND is_open_to_trial = true)
      )
    )
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

-- =====================================================
-- user_progress: INSERT / UPDATE に可視コンテンツ限定のEXISTS条件を追加
--
-- 進捗API（/api/progress）は upsert（onConflict: user_id,content_id）のため、
-- 既存行がある場合は UPDATE 経路を通る。INSERT だけでなく UPDATE にも
-- 同じ条件を課さないと2回目以降の更新がすり抜ける。
-- =====================================================

DROP POLICY IF EXISTS "Users can insert own progress" ON user_progress;
CREATE POLICY "Users can insert own progress"
  ON user_progress FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select get_user_id())
    AND EXISTS (SELECT 1 FROM learning_contents WHERE id = content_id)
  );

DROP POLICY IF EXISTS "Users can update own progress" ON user_progress;
CREATE POLICY "Users can update own progress"
  ON user_progress FOR UPDATE TO authenticated
  USING (
    user_id = (select get_user_id())
    AND EXISTS (SELECT 1 FROM learning_contents WHERE id = content_id)
  );

-- =====================================================
-- submissions: INSERT に可視コンテンツ限定のEXISTS条件を追加
--
-- 提出物は作成後に受講生が更新・削除しないため、upsertのような
-- UPDATE経路を通ることはなく、INSERTのみで足りる。
-- =====================================================

DROP POLICY IF EXISTS "Users can insert own submissions" ON submissions;
CREATE POLICY "Users can insert own submissions"
  ON submissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select get_user_id())
    AND EXISTS (SELECT 1 FROM learning_contents WHERE id = content_id)
  );

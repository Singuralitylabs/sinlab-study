-- =====================================================
-- Row Level Security (RLS) ポリシー: 全テーブル
-- ※ ロールチェックには get_user_role() / get_user_id() を使用
--   （SECURITY DEFINER関数でRLSバイパスし無限再帰を防止）
-- =====================================================

-- =====================================================
-- RLS 有効化
-- =====================================================

ALTER TABLE learning_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reviews ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- learning_themes ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Published themes are viewable by authenticated users" ON learning_themes;
CREATE POLICY "Published themes are viewable by authenticated users"
  ON learning_themes FOR SELECT TO authenticated
  USING (is_published = true AND is_deleted = false);

DROP POLICY IF EXISTS "Admins can view all themes" ON learning_themes;
CREATE POLICY "Admins can view all themes"
  ON learning_themes FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can view all themes" ON learning_themes;
CREATE POLICY "Maintainers can view all themes"
  ON learning_themes FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can insert themes" ON learning_themes;
CREATE POLICY "Admins can insert themes"
  ON learning_themes FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can insert themes" ON learning_themes;
CREATE POLICY "Maintainers can insert themes"
  ON learning_themes FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can update themes" ON learning_themes;
CREATE POLICY "Admins can update themes"
  ON learning_themes FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can update themes" ON learning_themes;
CREATE POLICY "Maintainers can update themes"
  ON learning_themes FOR UPDATE TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can delete themes" ON learning_themes;
CREATE POLICY "Admins can delete themes"
  ON learning_themes FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can delete themes" ON learning_themes;
CREATE POLICY "Maintainers can delete themes"
  ON learning_themes FOR DELETE TO authenticated
  USING (get_user_role() = 'maintainer');

-- =====================================================
-- users ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Users can view own record" ON users;
CREATE POLICY "Users can view own record"
  ON users FOR SELECT TO authenticated
  USING (auth_id = auth.uid() AND is_deleted = false);

DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can view all users" ON users;
CREATE POLICY "Maintainers can view all users"
  ON users FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Authenticated users can insert own record" ON users;
CREATE POLICY "Authenticated users can insert own record"
  ON users FOR INSERT TO authenticated
  WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update users" ON users;
CREATE POLICY "Admins can update users"
  ON users FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin');

-- =====================================================
-- learning_phases ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Published phases are viewable by authenticated users" ON learning_phases;
CREATE POLICY "Published phases are viewable by authenticated users"
  ON learning_phases FOR SELECT TO authenticated
  USING (is_published = true AND is_deleted = false);

DROP POLICY IF EXISTS "Admins can view all phases" ON learning_phases;
CREATE POLICY "Admins can view all phases"
  ON learning_phases FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can view all phases" ON learning_phases;
CREATE POLICY "Maintainers can view all phases"
  ON learning_phases FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can insert phases" ON learning_phases;
CREATE POLICY "Admins can insert phases"
  ON learning_phases FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can insert phases" ON learning_phases;
CREATE POLICY "Maintainers can insert phases"
  ON learning_phases FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can update phases" ON learning_phases;
CREATE POLICY "Admins can update phases"
  ON learning_phases FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can update phases" ON learning_phases;
CREATE POLICY "Maintainers can update phases"
  ON learning_phases FOR UPDATE TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can delete phases" ON learning_phases;
CREATE POLICY "Admins can delete phases"
  ON learning_phases FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can delete phases" ON learning_phases;
CREATE POLICY "Maintainers can delete phases"
  ON learning_phases FOR DELETE TO authenticated
  USING (get_user_role() = 'maintainer');

-- =====================================================
-- learning_weeks ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Published weeks are viewable by authenticated users" ON learning_weeks;
CREATE POLICY "Published weeks are viewable by authenticated users"
  ON learning_weeks FOR SELECT TO authenticated
  USING (is_published = true AND is_deleted = false);

DROP POLICY IF EXISTS "Admins can view all weeks" ON learning_weeks;
CREATE POLICY "Admins can view all weeks"
  ON learning_weeks FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can view all weeks" ON learning_weeks;
CREATE POLICY "Maintainers can view all weeks"
  ON learning_weeks FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can insert weeks" ON learning_weeks;
CREATE POLICY "Admins can insert weeks"
  ON learning_weeks FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can insert weeks" ON learning_weeks;
CREATE POLICY "Maintainers can insert weeks"
  ON learning_weeks FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can update weeks" ON learning_weeks;
CREATE POLICY "Admins can update weeks"
  ON learning_weeks FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can update weeks" ON learning_weeks;
CREATE POLICY "Maintainers can update weeks"
  ON learning_weeks FOR UPDATE TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can delete weeks" ON learning_weeks;
CREATE POLICY "Admins can delete weeks"
  ON learning_weeks FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can delete weeks" ON learning_weeks;
CREATE POLICY "Maintainers can delete weeks"
  ON learning_weeks FOR DELETE TO authenticated
  USING (get_user_role() = 'maintainer');

-- =====================================================
-- learning_contents ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Published contents are viewable by authenticated users" ON learning_contents;
CREATE POLICY "Published contents are viewable by authenticated users"
  ON learning_contents FOR SELECT TO authenticated
  USING (is_published = true AND is_deleted = false);

DROP POLICY IF EXISTS "Admins can view all contents" ON learning_contents;
CREATE POLICY "Admins can view all contents"
  ON learning_contents FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can view all contents" ON learning_contents;
CREATE POLICY "Maintainers can view all contents"
  ON learning_contents FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can insert contents" ON learning_contents;
CREATE POLICY "Admins can insert contents"
  ON learning_contents FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can insert contents" ON learning_contents;
CREATE POLICY "Maintainers can insert contents"
  ON learning_contents FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can update contents" ON learning_contents;
CREATE POLICY "Admins can update contents"
  ON learning_contents FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can update contents" ON learning_contents;
CREATE POLICY "Maintainers can update contents"
  ON learning_contents FOR UPDATE TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Admins can delete contents" ON learning_contents;
CREATE POLICY "Admins can delete contents"
  ON learning_contents FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can delete contents" ON learning_contents;
CREATE POLICY "Maintainers can delete contents"
  ON learning_contents FOR DELETE TO authenticated
  USING (get_user_role() = 'maintainer');

-- =====================================================
-- user_progress ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Users can view own progress" ON user_progress;
CREATE POLICY "Users can view own progress"
  ON user_progress FOR SELECT TO authenticated
  USING (user_id = get_user_id());

DROP POLICY IF EXISTS "Admins can view all progress" ON user_progress;
CREATE POLICY "Admins can view all progress"
  ON user_progress FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Users can insert own progress" ON user_progress;
CREATE POLICY "Users can insert own progress"
  ON user_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = get_user_id());

DROP POLICY IF EXISTS "Users can update own progress" ON user_progress;
CREATE POLICY "Users can update own progress"
  ON user_progress FOR UPDATE TO authenticated
  USING (user_id = get_user_id());

-- =====================================================
-- submissions ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Users can view own submissions" ON submissions;
CREATE POLICY "Users can view own submissions"
  ON submissions FOR SELECT TO authenticated
  USING (user_id = get_user_id());

DROP POLICY IF EXISTS "Admins can view all submissions" ON submissions;
CREATE POLICY "Admins can view all submissions"
  ON submissions FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can view all submissions" ON submissions;
CREATE POLICY "Maintainers can view all submissions"
  ON submissions FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

DROP POLICY IF EXISTS "Users can insert own submissions" ON submissions;
CREATE POLICY "Users can insert own submissions"
  ON submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = get_user_id());

-- =====================================================
-- ai_reviews ポリシー
-- =====================================================

DROP POLICY IF EXISTS "Users can view own ai reviews" ON ai_reviews;
CREATE POLICY "Users can view own ai reviews"
  ON ai_reviews FOR SELECT TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM submissions WHERE user_id = get_user_id()
    )
  );

DROP POLICY IF EXISTS "Admins can view all ai reviews" ON ai_reviews;
CREATE POLICY "Admins can view all ai reviews"
  ON ai_reviews FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Maintainers can view all ai reviews" ON ai_reviews;
CREATE POLICY "Maintainers can view all ai reviews"
  ON ai_reviews FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

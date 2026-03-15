-- =====================================================
-- learning_themes Row Level Security (RLS) ポリシー
-- =====================================================

-- RLSを有効化
ALTER TABLE learning_themes ENABLE ROW LEVEL SECURITY;

-- 公開テーマは認証ユーザーなら誰でも閲覧可能
DROP POLICY IF EXISTS "Published themes are viewable by authenticated users" ON learning_themes;
CREATE POLICY "Published themes are viewable by authenticated users"
  ON learning_themes FOR SELECT
  TO authenticated
  USING (is_published = true AND is_deleted = false);

-- 管理者はすべてのテーマを閲覧可能
DROP POLICY IF EXISTS "Admins can view all themes" ON learning_themes;
CREATE POLICY "Admins can view all themes"
  ON learning_themes FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

-- 講師はすべてのテーマを閲覧可能
DROP POLICY IF EXISTS "Maintainers can view all themes" ON learning_themes;
CREATE POLICY "Maintainers can view all themes"
  ON learning_themes FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

-- 管理者はテーマを作成可能
DROP POLICY IF EXISTS "Admins can insert themes" ON learning_themes;
CREATE POLICY "Admins can insert themes"
  ON learning_themes FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');

-- 講師はテーマを作成可能
DROP POLICY IF EXISTS "Maintainers can insert themes" ON learning_themes;
CREATE POLICY "Maintainers can insert themes"
  ON learning_themes FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'maintainer');

-- 管理者はテーマを更新可能
DROP POLICY IF EXISTS "Admins can update themes" ON learning_themes;
CREATE POLICY "Admins can update themes"
  ON learning_themes FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin');

-- 講師はテーマを更新可能
DROP POLICY IF EXISTS "Maintainers can update themes" ON learning_themes;
CREATE POLICY "Maintainers can update themes"
  ON learning_themes FOR UPDATE TO authenticated
  USING (get_user_role() = 'maintainer');

-- 管理者はテーマを削除可能
DROP POLICY IF EXISTS "Admins can delete themes" ON learning_themes;
CREATE POLICY "Admins can delete themes"
  ON learning_themes FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- 講師はテーマを削除可能
DROP POLICY IF EXISTS "Maintainers can delete themes" ON learning_themes;
CREATE POLICY "Maintainers can delete themes"
  ON learning_themes FOR DELETE TO authenticated
  USING (get_user_role() = 'maintainer');

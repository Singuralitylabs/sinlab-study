-- =====================================================
-- クエリパターンに合わせたインデックス追加（#197 PR1）
--
-- 初期マイグレーション以来追加されていなかった複合インデックスを整備する。
-- 単一列 FK インデックスのうち ORDER BY display_order / submitted_at と
-- 併用されるものは複合インデックスに置換する。
-- RLS ポリシーの書き換えは PR2 で行う（本マイグレーションは認可に影響しない）。
-- =====================================================

-- learning_phases / learning_weeks / learning_contents:
-- WHERE parent_id = ? ORDER BY display_order
DROP INDEX IF EXISTS idx_learning_phases_theme_id;
CREATE INDEX IF NOT EXISTS idx_learning_phases_theme_id
  ON learning_phases(theme_id, display_order);

DROP INDEX IF EXISTS idx_learning_weeks_phase_id;
CREATE INDEX IF NOT EXISTS idx_learning_weeks_phase_id
  ON learning_weeks(phase_id, display_order);

DROP INDEX IF EXISTS idx_learning_contents_week_id;
CREATE INDEX IF NOT EXISTS idx_learning_contents_week_id
  ON learning_contents(week_id, display_order);

-- submissions:
-- ORDER BY submitted_at DESC, id DESC（管理者一覧 / ユーザー別一覧）
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at
  ON submissions(submitted_at DESC, id DESC);

DROP INDEX IF EXISTS idx_submissions_user_id;
CREATE INDEX IF NOT EXISTS idx_submissions_user_id
  ON submissions(user_id, submitted_at DESC, id DESC);

-- user_progress:
-- UNIQUE(user_id, content_id) と重複する idx_user_progress_user_id を削除し、
-- RPC get_students_progress_summary 向けの部分インデックスを追加する
DROP INDEX IF EXISTS idx_user_progress_user_id;
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id_completed
  ON user_progress(user_id, completed_at)
  WHERE is_completed = true;

-- users:
-- auth_id UNIQUE と重複する idx_users_auth_role を削除する
DROP INDEX IF EXISTS idx_users_auth_role;

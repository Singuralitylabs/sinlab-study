-- =====================================================
-- クエリパターンに合わせたインデックス追加（#197 PR1）
--
-- 初期マイグレーション以来追加されていなかった複合・部分インデックスを整備する。
-- 単一列 FK インデックスのうち ORDER BY display_order / submitted_at と
-- 併用されるものは複合インデックスに置換する。
-- RLS ポリシーの書き換えは PR2 で行う（本マイグレーションは認可に影響しない）。
-- =====================================================

-- learning_phases / learning_weeks / learning_contents:
-- WHERE parent_id = ? ORDER BY display_order を複合インデックスで支える
DROP INDEX IF EXISTS idx_learning_phases_theme_id;
CREATE INDEX idx_learning_phases_theme_id ON learning_phases(theme_id, display_order);

DROP INDEX IF EXISTS idx_learning_weeks_phase_id;
CREATE INDEX idx_learning_weeks_phase_id ON learning_weeks(phase_id, display_order);

DROP INDEX IF EXISTS idx_learning_contents_week_id;
CREATE INDEX idx_learning_contents_week_id ON learning_contents(week_id, display_order);

-- submissions:
-- 管理者一覧（ORDER BY submitted_at DESC + range）と
-- ユーザー別一覧（WHERE user_id = ? ORDER BY submitted_at DESC）
CREATE INDEX idx_submissions_submitted_at ON submissions(submitted_at DESC);

DROP INDEX IF EXISTS idx_submissions_user_id;
CREATE INDEX idx_submissions_user_id ON submissions(user_id, submitted_at DESC);

-- user_progress:
-- WHERE user_id = ? AND is_completed = true / RPC の完了集計向け部分インデックス
-- （全行向けの idx_user_progress_user_id は他クエリ用に残す）
CREATE INDEX idx_user_progress_user_id_completed
  ON user_progress(user_id)
  WHERE is_completed = true;

-- users:
-- WHERE status = 'active' AND is_deleted = false（管理画面の受講生一覧）
CREATE INDEX idx_users_status_not_deleted
  ON users(status)
  WHERE is_deleted = false;

-- auth_id UNIQUE と重複していた (auth_id, role, is_deleted) を、
-- get_user_id / get_user_role / get_user_status が参照する列を INCLUDE した
-- covering index に置換（index-only scan 向け）
DROP INDEX IF EXISTS idx_users_auth_role;
CREATE INDEX idx_users_auth_id_covering
  ON users(auth_id)
  INCLUDE (id, role, status, is_deleted);

-- ai_reviews:
-- WHERE submission_id = ? ORDER BY reviewed_at DESC LIMIT 1
CREATE INDEX idx_ai_reviews_submission_id_reviewed_at
  ON ai_reviews(submission_id, reviewed_at DESC);

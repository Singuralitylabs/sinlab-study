-- =====================================================
-- クエリパターンに合わせたインデックス追加（#197 PR1）
--
-- 初期マイグレーション以来追加されていなかった複合インデックスを整備する。
-- 単一列 FK インデックスのうち ORDER BY display_order / submitted_at と
-- 併用されるものは複合インデックスに置換する。
-- 既存の UNIQUE 制約インデックスと重複する候補、および実クエリが存在しない
-- 候補は追加しない（レビュー指摘反映）。
-- RLS ポリシーの書き換えは PR2 で行う（本マイグレーションは認可に影響しない）。
-- =====================================================

-- learning_phases / learning_weeks / learning_contents:
-- WHERE parent_id = ? ORDER BY display_order を複合インデックスで支える
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
-- 実クエリは ORDER BY submitted_at DESC, id DESC（タイブレーカー付き）。
-- range は offset ページネーション（count: exact）であり submitted_at の範囲条件ではない。
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at
  ON submissions(submitted_at DESC, id DESC);

DROP INDEX IF EXISTS idx_submissions_user_id;
CREATE INDEX IF NOT EXISTS idx_submissions_user_id
  ON submissions(user_id, submitted_at DESC, id DESC);

-- user_progress:
-- UNIQUE(user_id, content_id) が user_id 絞り込み＋ content_id 順を賄うため、
-- 冗長な idx_user_progress_user_id は削除する。
-- RPC get_students_progress_summary（WHERE is_completed = true GROUP BY user_id
-- + max(completed_at)）向けに部分インデックスを追加する。
DROP INDEX IF EXISTS idx_user_progress_user_id;
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id_completed
  ON user_progress(user_id, completed_at)
  WHERE is_completed = true;

-- users:
-- idx_users_auth_role は auth_id UNIQUE（users_auth_id_key）とキーが重複し、
-- get_user_status() が必要とする status もカバーしないため削除する。
-- covering index の二重作成は行わない（UNIQUE 制約インデックスで十分。
-- users は更新が多く・行数も小さいため index-only scan の効果はほぼ出ない）。
DROP INDEX IF EXISTS idx_users_auth_role;

-- 注: 以下は意図的に追加しない
-- - idx_users_status_not_deleted:
--   管理画面の受講生一覧は is_deleted = false のみで status を絞らない。
-- - idx_ai_reviews_submission_id_reviewed_at:
--   submission_id は UNIQUE のため 1 提出 1 行。ORDER BY reviewed_at に意味がなく、
--   既存の ai_reviews_submission_id_key が参照を賄う。
-- - users(auth_id) INCLUDE (...):
--   users_auth_id_key との二重インデックスになるため作らない。

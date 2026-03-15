-- =====================================================
-- AIレビューテーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_reviews (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  review_content TEXT,
  overall_score INTEGER CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100)),
  model_used VARCHAR(100),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  error_message TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 自動更新トリガー（001で定義済みの汎用関数を再利用）
DROP TRIGGER IF EXISTS update_ai_reviews_updated_at ON ai_reviews;
CREATE TRIGGER update_ai_reviews_updated_at
  BEFORE UPDATE ON ai_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- インデックス（submission_id は UNIQUE 制約により暗黙のユニークインデックスが存在するため省略）
CREATE INDEX IF NOT EXISTS idx_ai_reviews_status ON ai_reviews(status);

-- =====================================================
-- RLSポリシー
-- =====================================================

ALTER TABLE ai_reviews ENABLE ROW LEVEL SECURITY;

-- 受講生: 自分の提出に紐づくレビューのみ閲覧可能
DROP POLICY IF EXISTS "Users can view own ai reviews" ON ai_reviews;
CREATE POLICY "Users can view own ai reviews"
  ON ai_reviews FOR SELECT TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM submissions
      WHERE user_id = get_user_id()
    )
  );

-- 管理者: 全レビュー閲覧可能
DROP POLICY IF EXISTS "Admins can view all ai reviews" ON ai_reviews;
CREATE POLICY "Admins can view all ai reviews"
  ON ai_reviews FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

-- 講師(maintainer): 全レビュー閲覧可能
DROP POLICY IF EXISTS "Maintainers can view all ai reviews" ON ai_reviews;
CREATE POLICY "Maintainers can view all ai reviews"
  ON ai_reviews FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');

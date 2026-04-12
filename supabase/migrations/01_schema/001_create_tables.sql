-- =====================================================
-- スキーマ定義: 全テーブル・関数・トリガー・インデックス
-- =====================================================

-- =====================================================
-- ヘルパー関数（usersテーブルに依存しないもの）
-- =====================================================

-- updated_at 自動更新トリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- テーブル定義
-- =====================================================

-- 学習テーマ（GAS学習、Webアプリ開発 など）
CREATE TABLE IF NOT EXISTS learning_themes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザー
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  auth_id UUID NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'maintainer', 'member')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  bio TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- フェーズ（Phase 1 - 基礎文法 など）
CREATE TABLE IF NOT EXISTS learning_phases (
  id SERIAL PRIMARY KEY,
  theme_id INTEGER NOT NULL REFERENCES learning_themes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 週（Week 1 - はじめの一歩 など）
CREATE TABLE IF NOT EXISTS learning_weeks (
  id SERIAL PRIMARY KEY,
  phase_id INTEGER NOT NULL REFERENCES learning_phases(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- コンテンツ（動画/スライド/テキスト/演習）
CREATE TABLE IF NOT EXISTS learning_contents (
  id SERIAL PRIMARY KEY,
  week_id INTEGER NOT NULL REFERENCES learning_weeks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'text', 'exercise', 'slide')),
  video_url TEXT,                    -- 動画: YouTube URL
  pdf_url TEXT,                      -- スライド: Supabase Storage PDF URL
  text_content TEXT,                 -- テキスト: Markdown
  exercise_instructions TEXT,        -- 演習: 指示文（Markdown）
  reference_answer TEXT,             -- 演習: 模範回答（AIレビュー採点基準）
  allowed_submission_types VARCHAR(20) NOT NULL DEFAULT 'code'
    CHECK (allowed_submission_types IN ('code', 'url', 'both')),
  code_language VARCHAR(20) NOT NULL DEFAULT 'javascript'
    CHECK (code_language IN ('javascript', 'typescript', 'html', 'css')),
  hint TEXT,
  display_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザー進捗
CREATE TABLE IF NOT EXISTS user_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES learning_contents(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);

-- 課題提出
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES learning_contents(id) ON DELETE CASCADE,
  submission_type VARCHAR(20) NOT NULL CHECK (submission_type IN ('code', 'url')),
  code_content TEXT,
  url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AIレビュー
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

-- =====================================================
-- RLSポリシー用ヘルパー関数（usersテーブル作成後に定義）
-- LANGUAGE sql はコンパイル時にテーブルの存在を検証するため、
-- usersテーブルより後に定義する必要がある
-- =====================================================

-- 認証ユーザーのロールを返す（SECURITY DEFINERでRLSバイパスし無限再帰を防止）
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role::text FROM users WHERE auth_id = auth.uid() AND is_deleted = false LIMIT 1;
$$;

-- 認証ユーザーの内部IDを返す
CREATE OR REPLACE FUNCTION public.get_user_id()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() AND is_deleted = false LIMIT 1;
$$;

-- =====================================================
-- updated_at トリガー
-- =====================================================

DROP TRIGGER IF EXISTS update_learning_themes_updated_at ON learning_themes;
CREATE TRIGGER update_learning_themes_updated_at
  BEFORE UPDATE ON learning_themes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_learning_phases_updated_at ON learning_phases;
CREATE TRIGGER update_learning_phases_updated_at
  BEFORE UPDATE ON learning_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_learning_weeks_updated_at ON learning_weeks;
CREATE TRIGGER update_learning_weeks_updated_at
  BEFORE UPDATE ON learning_weeks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_learning_contents_updated_at ON learning_contents;
CREATE TRIGGER update_learning_contents_updated_at
  BEFORE UPDATE ON learning_contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_reviews_updated_at ON ai_reviews;
CREATE TRIGGER update_ai_reviews_updated_at
  BEFORE UPDATE ON ai_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- インデックス
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_learning_phases_theme_id ON learning_phases(theme_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_role ON users(auth_id, role, is_deleted);
CREATE INDEX IF NOT EXISTS idx_learning_weeks_phase_id ON learning_weeks(phase_id);
CREATE INDEX IF NOT EXISTS idx_learning_contents_week_id ON learning_contents(week_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_content_id ON user_progress(content_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_content_id ON submissions(content_id);
CREATE INDEX IF NOT EXISTS idx_ai_reviews_status ON ai_reviews(status);

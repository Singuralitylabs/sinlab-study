-- =====================================================
-- Web技術学習支援サービス - データベーススキーマ
-- =====================================================

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

-- フェーズ（Phase 1 - GAS基礎 など）
CREATE TABLE IF NOT EXISTS learning_phases (
  id SERIAL PRIMARY KEY,
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

-- コンテンツ（動画/テキスト/演習）
CREATE TABLE IF NOT EXISTS learning_contents (
  id SERIAL PRIMARY KEY,
  week_id INTEGER NOT NULL REFERENCES learning_weeks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'text', 'exercise')),
  video_url TEXT,           -- 動画: YouTube URL
  text_content TEXT,        -- テキスト: Markdown
  exercise_instructions TEXT, -- 演習: 指示文（Markdown）
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
  code_content TEXT,        -- コード提出
  url TEXT,                 -- URL提出
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_users_auth_role ON users(auth_id, role, is_deleted);
CREATE INDEX IF NOT EXISTS idx_learning_weeks_phase_id ON learning_weeks(phase_id);
CREATE INDEX IF NOT EXISTS idx_learning_contents_week_id ON learning_contents(week_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_content_id ON user_progress(content_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_content_id ON submissions(content_id);

-- RLSポリシー用ヘルパー関数（SECURITY DEFINERでRLSをバイパスし無限再帰を防止）
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role::text FROM users WHERE auth_id = auth.uid() AND is_deleted = false LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_id()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() AND is_deleted = false LIMIT 1;
$$;

-- updated_at自動更新トリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 各テーブルにトリガーを設定
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

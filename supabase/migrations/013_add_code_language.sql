-- learning_contents テーブルにコードエディタの言語カラムを追加
-- 演習コンテンツのコード提出フォームで使用するシンタックスハイライト言語を指定する
-- 'javascript': JavaScript / GAS（デフォルト）
-- 'typescript': TypeScript
-- 'html': HTML
-- 'css': CSS

ALTER TABLE learning_contents
  ADD COLUMN IF NOT EXISTS code_language VARCHAR(20) NOT NULL DEFAULT 'javascript'
    CHECK (code_language IN ('javascript', 'typescript', 'html', 'css'));

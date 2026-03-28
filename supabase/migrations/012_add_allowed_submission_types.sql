-- learning_contents テーブルに演習コンテンツの許可提出方法カラムを追加
-- 'code': コードのみ（デフォルト）
-- 'url': URLのみ
-- 'both': コード・URL両方から選択可

ALTER TABLE learning_contents
  ADD COLUMN IF NOT EXISTS allowed_submission_types VARCHAR(20) NOT NULL DEFAULT 'code'
    CHECK (allowed_submission_types IN ('code', 'url', 'both'));

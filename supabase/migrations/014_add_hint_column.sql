-- 演習コンテンツにヒントカラムを追加
-- hint: 受講生向けのヒントテキスト（NULL許容）

ALTER TABLE learning_contents
  ADD COLUMN IF NOT EXISTS hint TEXT NULL;

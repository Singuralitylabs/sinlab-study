-- learning_contents テーブルに模範回答カラムを追加
-- AIレビュー時に採点基準として使用し、トークン消費削減と採点品質安定化を目的とする
ALTER TABLE learning_contents
  ADD COLUMN IF NOT EXISTS reference_answer TEXT;

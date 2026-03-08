-- スライド（PDF）コンテンツタイプの追加

-- 既存の CHECK制約を削除して再作成
ALTER TABLE learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_content_type_check;

ALTER TABLE learning_contents
  ADD CONSTRAINT learning_contents_content_type_check
  CHECK (content_type IN ('video', 'text', 'exercise', 'slide'));

-- PDFファイルURL用カラムを追加
ALTER TABLE learning_contents
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

COMMENT ON COLUMN learning_contents.pdf_url IS 'スライド: Supabase StorageのPDF URL';

-- Supabase Storageバケット作成（手動実行が必要な場合あり）
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('slides', 'slides', true)
-- ON CONFLICT (id) DO NOTHING;

-- ====================================================
-- スライドPDFのURLをSupabaseプロジェクトIDを修正
-- 旧: rityzrpwpwcbgvvtsfsg.supabase.co（旧プロジェクト）
-- 新: otrcfsvfgiwzuetnkfmk.supabase.co（現行プロジェクト）
-- ====================================================
UPDATE learning_contents
SET pdf_url = REPLACE(
  pdf_url,
  'https://rityzrpwpwcbgvvtsfsg.supabase.co',
  'https://otrcfsvfgiwzuetnkfmk.supabase.co'
)
WHERE pdf_url LIKE '%rityzrpwpwcbgvvtsfsg.supabase.co%';

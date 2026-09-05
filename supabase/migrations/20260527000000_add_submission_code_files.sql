-- =====================================================
-- submissions テーブルに複数ファイル提出用カラムを追加
-- =====================================================
-- 演習課題で「コード.gs（GASサーバー側）と index.html（HTML側）」のように
-- 複数ファイルの提出が必要なケースに対応する。
--
-- 後方互換性:
--   - 単一ファイル提出は従来どおり code_content に保存（code_files は NULL）
--   - 複数ファイル提出は code_files に保存（code_content は NULL）
--   - 既存の提出データ（code_content のみ）はそのまま有効
--
-- 稼働中DB・新規セットアップの双方に対して、このファイルが code_files カラムの
-- 唯一の定義箇所となる（スキーマ定義ファイル 001 は確定履歴として変更しない方針）。
-- ADD COLUMN IF NOT EXISTS により冪等で、複数回適用しても安全。

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS code_files JSONB;

COMMENT ON COLUMN submissions.code_files IS
  '複数ファイル提出 [{filename, language, content}]。NULL の場合は code_content（単一ファイル）にフォールバック';

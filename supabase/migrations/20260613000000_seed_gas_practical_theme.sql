-- =====================================================
-- GAS学習（実践編）: テーマ行の登録
-- 階層: learning_themes > learning_phases > learning_weeks > learning_contents
-- 参考: 20260521000000_seed_gas_advanced_course_structure.sql（#49・応用編側の同種対応）
--
-- 背景（#166）: 「GAS学習（実践編）」の theme は本番DBに手動登録済みで、
-- 作成SQLがリポジトリのどこにも存在しない（docs/database.md 7.1節）。
-- フェーズ・週・コンテンツの作成は 20260614080707_seed_gas_practical_course_structure.sql が
-- 既に担っているが、そのテーマ行が存在しない場合は何もせず終了する実装のため、
-- 本ファイルで先にテーマ行を作成する（get-or-create。本番の実値をSELECTで確認済み）。
--
-- 注意: 本ファイルが作成するテーマ行は is_published=true（本番の実値）だが、
-- 20260614080707 が作成するフェーズ・週・コンテンツは is_published=false（下書き）。
-- そのためフレッシュ環境（`supabase db reset` 直後等）では、公開済みテーマの配下に
-- 公開コンテンツが1件も無い状態になり、受講生からは「0/0」のカードに見える。
-- 本番ではその後の管理画面操作でフェーズ・週・コンテンツが個別に公開されており、
-- この差はテーマ作成SQLの欠落とは別の既知差異（本Issueの対象外）。
--
-- 基礎コースのテーマ名リネーム（'GAS学習' → 'GAS学習（基礎編）'）は、本ファイルとは
-- 別の 20260906000000_rename_gas_basic_theme.sql で扱う（get-or-createの前提が
-- 異なるため分離。詳細は同ファイルのコメントを参照）。
--
-- タイムスタンプについて: 20260521000000 と同様、フェーズ・週の作成を担う
-- 20260614080707_seed_gas_practical_course_structure.sql より前に適用される必要が
-- あるため、意図的に過去日付を選んでいる（実際の適用日時ではない）。本番への反映時は
-- 同ファイルの手順（docs/database.md 7.1節）にならい、内容が本番の実値と一致することを
-- SELECTで確認したうえで `supabase migration repair --status applied 20260613000000` で
-- 適用済みとして記録する。
-- =====================================================

INSERT INTO learning_themes (name, description, display_order, is_published)
SELECT
  'GAS学習（実践編）',
  'GASを使って、実際にどんなことができるのか、さまざまな実例を紹介します。',
  3, true
WHERE NOT EXISTS (
  SELECT 1 FROM learning_themes WHERE name = 'GAS学習（実践編）'
);

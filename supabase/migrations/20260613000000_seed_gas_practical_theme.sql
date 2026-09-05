-- =====================================================
-- GAS学習（実践編）: テーマ行の登録 + 基礎コーステーマ名のリネーム
-- 階層: learning_themes > learning_phases > learning_weeks > learning_contents
-- 参考: 20260521000000_seed_gas_advanced_course_structure.sql（#49・応用編側の同種対応）
--
-- 背景（#166）: 「GAS学習（実践編）」の theme は本番DBに手動登録済みで、
-- 作成SQLがリポジトリのどこにも存在しない（docs/database.md 7.1節）。
-- フェーズ・週・コンテンツの作成は 20260614080707_seed_gas_practical_course_structure.sql が
-- 既に担っているが、そのテーマ行が存在しない場合は何もせず終了する実装のため、
-- 本ファイルで先にテーマ行を作成する（get-or-create。本番の実値をSELECTで確認済み）。
--
-- 併せて、基礎コースのテーマ名が本番では 'GAS学習' ではなく 'GAS学習（基礎編）' に
-- リネームされている差異（20260412010002_seed_gas_course_structure.sql には未反映）も
-- ここで解消する。名前が 'GAS学習' のときのみリネームする冪等な UPDATE とし、
-- 新規プロジェクト・本番環境のどちらに適用しても最終的に 'GAS学習（基礎編）' になる。
--
-- タイムスタンプについて: 20260521000000 と同様、フェーズ・週の作成を担う
-- 20260614080707_seed_gas_practical_course_structure.sql より前に適用される必要が
-- あるため、意図的に過去日付を選んでいる（実際の適用日時ではない）。本番への反映時は
-- 同ファイルの手順（docs/database.md 7.1節）にならい、内容が本番の実値と一致することを
-- SELECTで確認したうえで `supabase migration repair --status applied 20260613000000` で
-- 適用済みとして記録する。
-- =====================================================

DO $$
DECLARE
  v_theme_id INTEGER;
BEGIN
  -- ====================================================
  -- 基礎コースのテーマ名リネーム（'GAS学習' → 'GAS学習（基礎編）'）
  -- ====================================================
  UPDATE learning_themes
  SET name = 'GAS学習（基礎編）'
  WHERE name = 'GAS学習';

  -- ====================================================
  -- テーマ取得（なければ作成）: GAS学習（実践編）
  -- ====================================================
  SELECT id INTO v_theme_id FROM learning_themes WHERE name = 'GAS学習（実践編）';
  IF v_theme_id IS NULL THEN
    INSERT INTO learning_themes (name, description, display_order, is_published)
    VALUES (
      'GAS学習（実践編）',
      'GASを使って、実際にどんなことができるのか、さまざまな実例を紹介します。',
      3, true
    )
    RETURNING id INTO v_theme_id;
  END IF;
END $$;

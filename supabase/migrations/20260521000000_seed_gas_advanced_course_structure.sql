-- =====================================================
-- GAS学習（応用編）: テーマ・フェーズ・週・コンテンツ構造の登録
-- 階層: learning_themes > learning_phases > learning_weeks > learning_contents
-- 参考: 20260412010002_seed_gas_course_structure.sql（GAS学習テーマの構造seed）
--
-- 背景（#49）: このテーマの theme/phase/week は本番DBに手動登録済みで、
-- 作成SQLがリポジトリのどこにも存在しない（docs/database.md 7.1節）。
-- 本ファイルの値は本番DBから直接SELECTして確認した実値。
-- get-or-create（NOT EXISTS 等）のため、本番のように既に存在する環境では
-- 何も変更せず終了し、フレッシュな環境でのみ本番と同じ構造を作成する。
--
-- Week「フォーム回答結果のWebアプリ公開」配下の video/slide のタイトルが
-- 週名と異なり「フォームのWebアプリ公開（動画/スライド）」になっているのは、
-- 本番の実データをそのまま反映したもの（週名変更前の名残とみられる）。
-- =====================================================

DO $$
DECLARE
  v_theme_id   INTEGER;
  v_phase1_id  INTEGER;
  v_phase2_id  INTEGER;
  v_week_id    INTEGER;
BEGIN
  -- ====================================================
  -- テーマ取得（なければ作成）
  -- ====================================================
  SELECT id INTO v_theme_id FROM learning_themes WHERE name = 'GAS学習（応用編）';
  IF v_theme_id IS NULL THEN
    INSERT INTO learning_themes (name, description, display_order, is_published)
    VALUES (
      'GAS学習（応用編）',
      'GASを使ったWebアプリケーション開発やライブラリ活用を学びます。',
      2, true
    )
    RETURNING id INTO v_theme_id;
  END IF;

  -- ====================================================
  -- Phase 1 - GASによるWebアプリケーション公開
  -- ====================================================
  SELECT id INTO v_phase1_id FROM learning_phases
    WHERE theme_id = v_theme_id AND name = 'Phase 1 - GASによるWebアプリケーション公開';
  IF v_phase1_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (
      v_theme_id, 'Phase 1 - GASによるWebアプリケーション公開',
      'HTML及びCSSを使ったGASによるWebアプリケーション公開方法を学びます',
      1, true
    )
    RETURNING id INTO v_phase1_id;
  END IF;

  -- Week: GASとHTMLの基礎
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase1_id AND name = 'GASとHTMLの基礎';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, display_order, is_published)
    VALUES (v_phase1_id, 'GASとHTMLの基礎', 1, true)
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'GASとHTMLの基礎（動画）', 'video', 'https://www.youtube.com/watch?v=E11ZBQwNCxg', 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'GASとHTMLの基礎（スライド）', 'slide', '/storage/v1/object/public/slides/gas-advanced/slide-01.pdf', 2, true);
  END IF;

  -- Week: GASとCSSの基礎
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase1_id AND name = 'GASとCSSの基礎';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, display_order, is_published)
    VALUES (v_phase1_id, 'GASとCSSの基礎', 2, true)
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'GASとCSSの基礎（動画）', 'video', 'https://www.youtube.com/watch?v=qvCqIeOsMH8&t=411s', 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'GASとCSSの基礎（スライド）', 'slide', '/storage/v1/object/public/slides/gas-advanced/slide-02.pdf', 2, true);
  END IF;

  -- Week: CSSフレームワーク
  -- 本番では display_order が 1 を飛ばして slide=2 / video=3 から始まる
  -- （欠番の経緯は不明だが、演習は既存の display_order 4〜 から続くため揃えている）
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase1_id AND name = 'CSSフレームワーク';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, display_order, is_published)
    VALUES (v_phase1_id, 'CSSフレームワーク', 3, true)
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'CSSフレームワーク（スライド）', 'slide', '/storage/v1/object/public/slides/gas-advanced/slide-03.pdf', 2, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'CSSフレームワーク（動画）', 'video', 'https://www.youtube.com/watch?v=xrh237CSi9k', 3, true);
  END IF;

  -- ====================================================
  -- Phase 2 - GoogleサービスとWebアプリケーション連携
  -- ====================================================
  SELECT id INTO v_phase2_id FROM learning_phases
    WHERE theme_id = v_theme_id AND name = 'Phase 2 - GoogleサービスとWebアプリケーション連携';
  IF v_phase2_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (
      v_theme_id, 'Phase 2 - GoogleサービスとWebアプリケーション連携',
      'スプレッドシートやフォームとWebアプリケーションを連携する方法を学びます',
      2, true
    )
    RETURNING id INTO v_phase2_id;
  END IF;

  -- Week: スプレッドシートのWebアプリ公開
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase2_id AND name = 'スプレッドシートのWebアプリ公開';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, display_order, is_published)
    VALUES (v_phase2_id, 'スプレッドシートのWebアプリ公開', 1, true)
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'スプレッドシートのWebアプリ公開（動画）', 'video', 'https://www.youtube.com/watch?v=62YBEUqeMYk', 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'スプレッドシートのWebアプリ公開（スライド）', 'slide', '/storage/v1/object/public/slides/gas-advanced/slide-04.pdf', 2, true);
  END IF;

  -- Week: フォーム回答結果のWebアプリ公開
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase2_id AND name = 'フォーム回答結果のWebアプリ公開';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, display_order, is_published)
    VALUES (v_phase2_id, 'フォーム回答結果のWebアプリ公開', 2, true)
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'フォームのWebアプリ公開（動画）', 'video', 'https://www.youtube.com/watch?v=oUmvnQDoIUI&feature=youtu.be', 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'フォームのWebアプリ公開（スライド）', 'slide', '/storage/v1/object/public/slides/gas-advanced/slide-05.pdf', 2, true);
  END IF;
END $$;

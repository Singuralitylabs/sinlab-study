-- =====================================================
-- GAS学習（応用編）: テーマ・フェーズ・週・コンテンツ構造の登録
-- 階層: learning_themes > learning_phases > learning_weeks > learning_contents
-- 参考: 20260412010002_seed_gas_course_structure.sql（GAS学習テーマの構造seed）
--
-- 背景（#49）: このテーマの theme/phase/week は本番DBに手動登録済みで、
-- 作成SQLがリポジトリのどこにも存在しない（docs/database.md 7.1節）。
-- 本ファイルは「本番に既に存在する行は上書き・重複作成しない」ことを
-- 最優先に設計している。
--
-- フェーズの get-or-create は「フェーズ名」ではなく「配下の週が既に存在するか」
-- で行う（v_phase*_id の SELECT を参照）。週名は
-- 20260524000000_seed_gas_advanced_exercises.sql の WHERE 句が前提とする値と
-- 完全一致させており、本番でも同名の週が既に存在するため、本番適用時は
-- フェーズの実名を知らなくても既存フェーズに正しく解決される
-- （新規フェーズの重複作成は起きない）。一方で、以下の値は本番の実値を
-- 未確認のまま暫定値を入れている。本番に既存の行がある環境では
-- INSERT自体が走らないため実害はないが、フェーズ名の表記統一のため
-- 本番の実値が判明し次第、要修正（#49 参照）。
--   - learning_themes: description, display_order, is_published
--   - learning_phases: name（表示名の表記）, description, display_order, is_published
--   - learning_weeks: display_order, is_published
--   - learning_contents（video/slide）: is_published
-- また Week「CSSフレームワーク」は既存コンテンツの display_order が
-- video=3 / slide=2 である証跡が演習seed側のコメントにあるが、
-- display_order=1 に何があるかは不明（本番未確認）。本ファイルでは
-- video/slideの2件のみ作成し、position=1は作成しない。
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
      'Google Apps Script を使った Web アプリケーション開発を学びます。HTML/CSS による画面作成の基礎から、スプレッドシート・フォームのデータを反映した Web アプリの公開までを扱います。',
      3, true
    )
    RETURNING id INTO v_theme_id;
  END IF;

  -- ====================================================
  -- Phase 1 - Web開発の基礎
  -- get-or-create は配下の週の存在で判定する（本番のフェーズ名不明のため）
  -- ====================================================
  SELECT p.id INTO v_phase1_id
  FROM learning_phases p
  WHERE p.theme_id = v_theme_id
    AND p.id IN (
      SELECT w.phase_id FROM learning_weeks w
      WHERE w.name IN ('GASとHTMLの基礎', 'GASとCSSの基礎', 'CSSフレームワーク')
    )
  LIMIT 1;

  IF v_phase1_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (
      v_theme_id, 'Phase 1 - Web開発の基礎',
      'GASでWebアプリケーションを公開する仕組みと、HTML/CSSによる画面作成の基礎を学びます。',
      1, true
    )
    RETURNING id INTO v_phase1_id;
  END IF;

  -- Week: GASとHTMLの基礎
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase1_id AND name = 'GASとHTMLの基礎';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (v_phase1_id, 'GASとHTMLの基礎',
      E'- GASによるWebアプリケーション公開の仕組み（doGet関数）\n- HtmlServiceの役割\n- HTMLファイルの作成と読み込み\n- ウェブアプリとしてのデプロイ\n- HTMLの基礎（タグ・要素・属性）\n- 見出し・段落・リスト・リンク・画像',
      1, true)
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
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (v_phase1_id, 'GASとCSSの基礎',
      E'- CSSとは\n- CSSの記述場所（style要素）\n- 文字色（color）と背景色（background-color）\n- フォントサイズ・文字寄せ\n- セレクタ（要素・class・id）\n- class属性とid属性による装飾',
      2, true)
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'GASとCSSの基礎（動画）', 'video', 'https://www.youtube.com/watch?v=qvCqIeOsMH8', 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'GASとCSSの基礎（スライド）', 'slide', '/storage/v1/object/public/slides/gas-advanced/slide-02.pdf', 2, true);
  END IF;

  -- Week: CSSフレームワーク
  -- 既存コンテンツの display_order が video=3 / slide=2 であることは
  -- 20260524000000_seed_gas_advanced_exercises.sql のコメントから判明済み
  -- （演習が display_order 4〜 から始まる理由として記載）。
  -- display_order=1 に何があるかは本番未確認（#49で要確認）。
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase1_id AND name = 'CSSフレームワーク';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (v_phase1_id, 'CSSフレームワーク',
      E'- CSSフレームワークとは\n- Tailwind CSSの導入（CDN）\n- ユーティリティクラスの使い方\n- Gridレイアウト（grid / grid-cols）\n- レスポンシブデザイン（ブレークポイント）',
      3, true)
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
  -- Phase 2 - Webアプリ公開
  -- ====================================================
  SELECT p.id INTO v_phase2_id
  FROM learning_phases p
  WHERE p.theme_id = v_theme_id
    AND p.id IN (
      SELECT w.phase_id FROM learning_weeks w
      WHERE w.name IN ('スプレッドシートのWebアプリ公開', 'フォーム回答結果のWebアプリ公開')
    )
  LIMIT 1;

  IF v_phase2_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (
      v_theme_id, 'Phase 2 - Webアプリ公開',
      'スプレッドシートやフォームのデータをWebアプリに反映する方法を学びます。',
      2, true
    )
    RETURNING id INTO v_phase2_id;
  END IF;

  -- Week: スプレッドシートのWebアプリ公開
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase2_id AND name = 'スプレッドシートのWebアプリ公開';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (v_phase2_id, 'スプレッドシートのWebアプリ公開',
      E'- HTMLテンプレート（スクリプトレット）\n- サーバー関数でのスプレッドシートデータ取得\n- テンプレートへの値の埋め込み（<?= ?>）\n- スプレッドシートの内容をテーブルで表示\n- google.script.runによるクライアント→サーバー通信',
      1, true)
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
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (v_phase2_id, 'フォーム回答結果のWebアプリ公開',
      E'- HTMLフォームの作成（input・textarea・button）\n- google.script.runによるフォームデータの送信\n- フォームデータのスプレッドシートへの保存\n- 成功ハンドラー（withSuccessHandler）\n- 回答結果の一覧表示',
      2, true)
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'フォーム回答結果のWebアプリ公開（動画）', 'video', 'https://www.youtube.com/watch?v=oUmvnQDoIUI', 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'フォーム回答結果のWebアプリ公開（スライド）', 'slide', '/storage/v1/object/public/slides/gas-advanced/slide-05.pdf', 2, true);
  END IF;
END $$;

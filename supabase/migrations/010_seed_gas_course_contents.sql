-- =====================================================
-- GAS学習コースコンテンツの一括登録
-- contents.csv の内容をDB階層にマッピング
-- 階層: learning_themes > learning_phases > learning_weeks > learning_contents
-- =====================================================

-- ====================================================
-- 既存データの全削除（外部キーカスケードで phases/weeks/contents も連鎖削除）
-- ====================================================
DELETE FROM learning_themes;

DO $$
DECLARE
  v_theme_id    INTEGER;
  v_phase1_id   INTEGER;
  v_phase2_id   INTEGER;
  v_phase3_id   INTEGER;
  v_phase4_id   INTEGER;
  v_phase5_id   INTEGER;
  v_phase6_id   INTEGER;
  v_week_id     INTEGER;
BEGIN

  -- ====================================================
  -- テーマ取得（なければ作成）
  -- ====================================================
  SELECT id INTO v_theme_id FROM learning_themes WHERE name = 'GAS学習';
  IF v_theme_id IS NULL THEN
    INSERT INTO learning_themes (name, description, display_order, is_published)
    VALUES ('GAS学習', 'Google Apps Scriptを使った自動化と開発の基礎を学びます', 1, true)
    RETURNING id INTO v_theme_id;
  END IF;

  -- ====================================================
  -- フェーズ登録（6フェーズ）
  -- ====================================================

  -- Phase 1: 基礎文法
  SELECT id INTO v_phase1_id
  FROM learning_phases WHERE theme_id = v_theme_id AND name = 'Phase 1 - 基礎文法';
  IF v_phase1_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (v_theme_id, 'Phase 1 - 基礎文法', 'JavaScriptの基礎文法を学びます', 1, true)
    RETURNING id INTO v_phase1_id;
  END IF;

  -- Phase 2: Googleドライブ
  SELECT id INTO v_phase2_id
  FROM learning_phases WHERE theme_id = v_theme_id AND name = 'Phase 2 - Googleドライブ';
  IF v_phase2_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (v_theme_id, 'Phase 2 - Googleドライブ', 'Googleドライブのファイル・フォルダ操作をGASで自動化します', 2, true)
    RETURNING id INTO v_phase2_id;
  END IF;

  -- Phase 3: スプレッドシート活用
  SELECT id INTO v_phase3_id
  FROM learning_phases WHERE theme_id = v_theme_id AND name = 'Phase 3 - スプレッドシート活用';
  IF v_phase3_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (v_theme_id, 'Phase 3 - スプレッドシート活用', 'スプレッドシートの操作とデータベース活用を学びます', 3, true)
    RETURNING id INTO v_phase3_id;
  END IF;

  -- Phase 4: Googleフォーム
  SELECT id INTO v_phase4_id
  FROM learning_phases WHERE theme_id = v_theme_id AND name = 'Phase 4 - Googleフォーム';
  IF v_phase4_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (v_theme_id, 'Phase 4 - Googleフォーム', 'Googleフォームの作成・トリガー・DB操作を学びます', 4, true)
    RETURNING id INTO v_phase4_id;
  END IF;

  -- Phase 5: Googleカレンダー
  SELECT id INTO v_phase5_id
  FROM learning_phases WHERE theme_id = v_theme_id AND name = 'Phase 5 - Googleカレンダー';
  IF v_phase5_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (v_theme_id, 'Phase 5 - Googleカレンダー', 'Googleカレンダーのイベント操作とエラーハンドリングを学びます', 5, true)
    RETURNING id INTO v_phase5_id;
  END IF;

  -- Phase 6: GASの便利な機能
  SELECT id INTO v_phase6_id
  FROM learning_phases WHERE theme_id = v_theme_id AND name = 'Phase 6 - GASの便利な機能';
  IF v_phase6_id IS NULL THEN
    INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
    VALUES (v_theme_id, 'Phase 6 - GASの便利な機能', 'プロパティストア・ダイアログ・ログ出力などGASの便利な機能を学びます', 6, true)
    RETURNING id INTO v_phase6_id;
  END IF;

  -- ====================================================
  -- 週（Week）とコンテンツの登録
  -- 各weekにvideo（display_order=1）とslide（display_order=2）を2件ずつ作成
  -- video_url・pdf_urlは後で更新するためNULL
  -- ====================================================

  -- ---- Phase 1 ----------------------------------------

  -- Week 1-1: 基礎文法の学習1
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase1_id AND name = '基礎文法の学習1';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase1_id,
      '基礎文法の学習1',
      E'- 基本的な書き方\n- ログ出力\n- コメント機能\n- 変数\n- 四則演算\n- 条件分岐（if文・switch文）',
      1,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, '基礎文法の学習1（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, '基礎文法の学習1（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- Week 1-2: 基礎文法の学習2
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase1_id AND name = '基礎文法の学習2';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase1_id,
      '基礎文法の学習2',
      E'- 配列\n- オブジェクト\n- 繰り返し文（for文・while文）\n- 関数',
      2,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, '基礎文法の学習2（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, '基礎文法の学習2（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- ---- Phase 2 ----------------------------------------

  -- Week 2: Googleドライブの操作
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase2_id AND name = 'Googleドライブの操作';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase2_id,
      'Googleドライブの操作',
      E'- Googleドライブとは\n- フォルダの操作（取得・名前変更・移動・新規作成）\n- ファイルの操作（取得・名前変更・移動・コピー・新規作成）',
      1,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'Googleドライブの操作（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'Googleドライブの操作（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- ---- Phase 3 ----------------------------------------

  -- Week 3-1: スプレッドシート操作1
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase3_id AND name = 'スプレッドシート操作1';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase3_id,
      'スプレッドシート操作1',
      E'- スプレッドシートとは\n- スプレッドシート・シート・セルへのアクセス\n- シート内のセルの値の取得及び入力',
      1,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'スプレッドシート操作1（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'スプレッドシート操作1（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- Week 3-2: スプレッドシート操作2
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase3_id AND name = 'スプレッドシート操作2';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase3_id,
      'スプレッドシート操作2',
      E'- 複数セルの取得と入力（2次元配列）\n- シートの操作\n- 行・列の追加\n- 行・列の削除\n- カスタム関数',
      2,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'スプレッドシート操作2（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'スプレッドシート操作2（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- Week 3-3: データベース活用
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase3_id AND name = 'データベース活用';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase3_id,
      'データベース活用',
      E'- データベースとは\n- データベース管理の4つの機能\n- 最終行・最終列の取得\n- データの加工\n- 関数の分割と汎用化',
      3,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'データベース活用（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'データベース活用（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- Week 3-4: Gmailの送信
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase3_id AND name = 'Gmailの送信';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase3_id,
      'Gmailの送信',
      E'- Gmailとは\n- GASによるGmailの送信\n- GASにおける文章の書き方\n- スプレッドシートを用いた一括Gmail送信システム',
      4,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'Gmailの送信（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'Gmailの送信（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- ---- Phase 4 ----------------------------------------

  -- Week 4-1: Googleフォーム
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase4_id AND name = 'Googleフォーム';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase4_id,
      'Googleフォーム',
      E'- Googleフォームとは\n- GoogleフォームのGAS活用事例\n- Googleフォームへのアクセス\n- フォームタイトル・説明文の取得\n- Googleフォームの作成\n- フォーム設問の作成・設定・削除',
      1,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'Googleフォーム（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'Googleフォーム（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- Week 4-2: Googleフォームの活用
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase4_id AND name = 'Googleフォームの活用';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase4_id,
      'Googleフォームの活用',
      E'- トリガー機能\n- フォーム回答の取得\n- GoogleフォームによるDB操作',
      2,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'Googleフォームの活用（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'Googleフォームの活用（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- ---- Phase 5 ----------------------------------------

  -- Week 5-1: Googleカレンダー操作
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase5_id AND name = 'Googleカレンダー操作';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase5_id,
      'Googleカレンダー操作',
      E'- Googleカレンダーとは\n- GoogleカレンダーをGASで扱うメリット\n- Dateオブジェクト\n- カレンダーへのアクセス\n- カレンダーイベントの取得・追加・更新・削除',
      1,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'Googleカレンダー操作（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'Googleカレンダー操作（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- Week 5-2: フォームによるカレンダー操作
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase5_id AND name = 'フォームによるカレンダー操作';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase5_id,
      'フォームによるカレンダー操作',
      E'- エラーハンドリング（例外処理）\n- 条件分岐による例外処理\n- try~catchによる例外処理\n- Googleフォームによる予約サービスを作ってみよう',
      2,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'フォームによるカレンダー操作（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'フォームによるカレンダー操作（スライド）', 'slide', NULL, 2, true);
  END IF;

  -- ---- Phase 6 ----------------------------------------

  -- Week 6: GASの便利な機能
  SELECT id INTO v_week_id FROM learning_weeks WHERE phase_id = v_phase6_id AND name = 'GASの便利な機能';
  IF v_week_id IS NULL THEN
    INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
    VALUES (
      v_phase6_id,
      'GASの便利な機能',
      E'- プロパティストアへのデータ保存\n- ダイアログの出力\n- スプレッドシートからのGAS実行\n- ログ出力の分類\n- 関数のコメントの設定',
      1,
      true
    )
    RETURNING id INTO v_week_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
    INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
    VALUES (v_week_id, 'GASの便利な機能（動画）', 'video', NULL, 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
    INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
    VALUES (v_week_id, 'GASの便利な機能（スライド）', 'slide', NULL, 2, true);
  END IF;

END $$;

-- ====================================================
-- Supabase Storage にアップロード済みのPDFスライドURLをセット
-- バケット: slides / フォルダ: gas/
-- 日本語ファイル名はStorage非対応のため slide-01.pdf〜slide-12.pdf に変換済み
-- ====================================================
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-01.pdf' WHERE title = '基礎文法の学習1（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-02.pdf' WHERE title = '基礎文法の学習2（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-03.pdf' WHERE title = 'Googleドライブの操作（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-04.pdf' WHERE title = 'スプレッドシート操作1（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-05.pdf' WHERE title = 'スプレッドシート操作2（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-06.pdf' WHERE title = 'データベース活用（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-07.pdf' WHERE title = 'Gmailの送信（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-08.pdf' WHERE title = 'Googleフォーム（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-09.pdf' WHERE title = 'Googleフォームの活用（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-10.pdf' WHERE title = 'Googleカレンダー操作（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-11.pdf' WHERE title = 'フォームによるカレンダー操作（スライド）';
UPDATE learning_contents SET pdf_url = 'https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-12.pdf' WHERE title = 'GASの便利な機能（スライド）';

-- ====================================================
-- 動画コンテンツのYouTube URLをセット
-- ====================================================
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=VkvRU334DYI' WHERE title = '基礎文法の学習1（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=TCzYJ3Fxbl0' WHERE title = '基礎文法の学習2（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=yKeofE0xtK4' WHERE title = 'Googleドライブの操作（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=wyx0KM46TwU' WHERE title = 'スプレッドシート操作1（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=o-kX-lelHXY' WHERE title = 'スプレッドシート操作2（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=7bkNZbKlszY' WHERE title = 'データベース活用（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=EjjHHt-oVKc' WHERE title = 'Gmailの送信（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=7EmiOhVmkFs' WHERE title = 'Googleフォーム（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=ioq82NFX0Z4' WHERE title = 'Googleフォームの活用（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=FOJMKV7l7n4' WHERE title = 'Googleカレンダー操作（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=2Fusjw7Ax0I' WHERE title = 'フォームによるカレンダー操作（動画）';
UPDATE learning_contents SET video_url = 'https://www.youtube.com/watch?v=vo87BAKkC8E' WHERE title = 'GASの便利な機能（動画）';

-- ====================================================
-- フェーズ構成変更: Gmailの送信を独立フェーズ（Phase 4）に分離
-- Phase 4 Googleフォーム → Phase 5
-- Phase 5 Googleカレンダー → Phase 6
-- Phase 6 GASの便利な機能 → Phase 7
-- ====================================================
UPDATE learning_phases SET display_order = 7, name = 'Phase 7 - GASの便利な機能' WHERE name = 'Phase 6 - GASの便利な機能';
UPDATE learning_phases SET display_order = 6, name = 'Phase 6 - Googleカレンダー'   WHERE name = 'Phase 5 - Googleカレンダー';
UPDATE learning_phases SET display_order = 5, name = 'Phase 5 - Googleフォーム'     WHERE name = 'Phase 4 - Googleフォーム';

INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
VALUES (
  (SELECT theme_id FROM learning_phases WHERE name = 'Phase 3 - スプレッドシート活用'),
  'Phase 4 - Gmailの送信',
  'GASによるGmail送信とスプレッドシートを活用したメール配信システムを学びます',
  4,
  true
);

UPDATE learning_weeks
SET phase_id = (SELECT id FROM learning_phases WHERE name = 'Phase 4 - Gmailの送信'),
    display_order = 1
WHERE name = 'Gmailの送信';

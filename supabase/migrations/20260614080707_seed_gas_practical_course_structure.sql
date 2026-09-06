-- =====================================================
-- GAS学習（実践編）: フェーズ・週・コンテンツ構造の登録
-- 階層: learning_themes > learning_phases > learning_weeks > learning_contents
-- 1トピック=1週、各週に video(display_order=1) と slide(display_order=2, PDFあるトピックのみ) を作成
-- すべて is_published=false（下書き）で投入。冪等（再実行可）。
--
-- 注意（#149）: 本ファイルはリモートの supabase_migrations.schema_migrations に
-- version=20260614080707 として記録されていたが、過去のディレクトリ再編時に
-- リポジトリから失われていたものを、その記録から復元した。
-- 前提となる learning_themes.name = 'GAS学習（実践編）' の行は本ファイルでは
-- 作成しない（存在しない場合は何もせず終了する）。調査時点（#149）では、このテーマ行
-- および 'GAS学習（応用編）'（20260524000000_seed_gas_advanced_exercises.sql が前提とする）の
-- learning_themes/learning_phases/learning_weeks の作成SQLがリポジトリのどこにも見つからず、
-- 本番環境で直接作成されたとみられる状態だった。その後、応用編側は
-- 20260521000000_seed_gas_advanced_course_structure.sql（#49）、実践編側のテーマ行は
-- 20260613000000_seed_gas_practical_theme.sql（#166）でそれぞれ解消済み。
--
-- 修正（#168）: 復元時点のVALUESでは「Geminiを使ったドキュメント自動要約」の所属フェーズを
-- 「その他GAS活用」（phase_no=5）としていたが、本番の実際の所属は「Googleドキュメント活用」
-- （phase_no=4）だったため、本番データとの1点の食い違いとして修正した。本番の週display_order
-- は1,2の次が6（3〜5は欠番）のため、ループ内で該当週の挿入値のみ明示的に上書きしている
-- （カウンタ自体（v_week_order）は書き換えず、以降にフェーズ4へ週を追加した場合の採番
-- （4, 5, ...）に影響しないようにしている）。
--
-- なお、本ファイルの旧バージョン（フェーズ誤り）が既に db push 済みの環境（version自体は
-- 記録済みのため本ファイルの変更は再実行されない）向けの移行措置は、本ファイルではなく
-- 独立した `20260906090000_move_gas_practical_gemini_week.sql` が担う（#168のレビュー指摘。
-- 詳細は同ファイルのコメントを参照）。
-- =====================================================
DO $$
DECLARE
  v_theme_id    INTEGER;
  v_phase_id    INTEGER;
  v_week_id     INTEGER;
  v_cur_phase   TEXT := NULL;
  v_week_order  INTEGER := 0;
  v_insert_order INTEGER;
  r RECORD;
BEGIN
  SELECT id INTO v_theme_id FROM learning_themes WHERE name = 'GAS学習（実践編）';
  IF v_theme_id IS NULL THEN
    -- テーマ自体の作成SQLがリポジトリにないため、新規プロジェクト等でまだ
    -- 存在しない場合は db push 全体を止めずにスキップする（advanced_exercises と同様の方針）
    RAISE NOTICE 'theme "GAS学習（実践編）" が見つからないためスキップします';
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      -- ordinal, phase_no, phase_name, topic, descr, video_url, slide(NULL可)
      -- ordinal は VALUES の記載順を明示するための連番（同一phase_no内の週の並び順を
      -- ORDER BY phase_no だけに委ねると、タイ発生時の順序がPostgreSQLの仕様上
      -- 保証されないため明示する）
      (1, 1, 'スプレッドシート活用', 'メール一括送信',
        E'スプレッドシートから複数のメールアドレスに一括送信するアプリを開発する方法を紹介します。',
        'https://youtu.be/IZrbLLSZ12g', 'slide-01'),
      (2, 1, 'スプレッドシート活用', '受信メールのシート出力',
        E'指定のメールアドレスに受信したメールを自動でスプレッドシートに出力する方法を紹介します。',
        'https://youtu.be/WRopAFRd2WY', 'slide-02'),
      (3, 1, 'スプレッドシート活用', 'To-Doリストの作成',
        E'スプレッドシートを使った簡単なTodoリストに、GASによる期限切れタスクのメール通知機能を追加する方法を紹介します。',
        'https://youtu.be/mxFbsG98Hw8', 'slide-03'),
      (4, 1, 'スプレッドシート活用', '変更のメール通知',
        E'スプレッドシートの変更を検知してメールで通知するアプリの実装方法を紹介します。',
        'https://youtu.be/GwzyLsu6MVo', 'slide-04'),
      (5, 1, 'スプレッドシート活用', '複数シートデータ集約',
        E'複数シートのデータを自動集計するアプリを開発する方法を紹介します。',
        'https://youtu.be/1xBPAHk5dOA', 'slide-05'),
      (6, 1, 'スプレッドシート活用', '勤怠管理アプリ',
        E'Google Apps Script (GAS) を使用して勤怠管理を自動化する方法を解説します。特に「退勤時間の記録」と「1日の勤務時間の自動計算」を行うスクリプトのコードについて、初心者にもわかりやすく説明します。このスクリプトを使えば、ボタン一つで退勤時間の記録と勤務時間の計算が行えるようになり、日々の勤怠管理の手間を大幅に削減できます。',
        'https://youtu.be/BTunXiwfNkQ', 'slide-06'),
      (7, 1, 'スプレッドシート活用', '家計簿アプリ',
        E'GASを使って支出データから前月のカテゴリ別支出サマリーを自動生成する方法を解説します。このスクリプトを使えば、毎月の支出の集計作業を自動化でき、効率的な家計管理が可能になります。日付の範囲計算、データの抽出・集計、そして結果の出力まで、すべて自動で処理されます。',
        'https://youtu.be/4noY3tR1lH4', 'slide-07'),
      (8, 1, 'スプレッドシート活用', '出席管理システム',
        E'関連note記事：\nhttps://note.com/hello_coding/n/n14e288303ec0\n\n- スプレッドシートの取得とデータ読み込み\n- 参加者毎の出席状況を集計\n- 出席率を計算して、別シートに出力',
        'https://youtu.be/pnVRhmWxZfo', 'slide-08'),
      (9, 1, 'スプレッドシート活用', '出欠リマインド送信',
        E'■テーマ：イベント出欠管理＆リマインド自動送信ツール\nGoogleスプレッドシートを活用し、イベント参加者の出欠管理と未回答者へのリマインドメール自動送信、回答状況の自動集計ができるツールを作成します。\n忘年会・新年会など社内イベントの出欠管理にも活用できます。\n\n関連note記事・ソースコード：\nhttps://note.com/hello_coding/n/nbee643d4ec07',
        'https://youtu.be/os2wWCHxsPs', 'slide-09'),
      (10, 1, 'スプレッドシート活用', 'スプレッドシートから請求書PDFを生成',
        E'スプレッドシートからPDF請求書生成\nシート上の請求書情報をテンプレート請求書に反映し、PDF化した請求書を生成する',
        'https://youtu.be/aVm2qTq4XhU', NULL),
      (11, 2, 'Googleフォーム活用', 'フォーム自動返信',
        E'Googleフォームの回答があると、自動でメールを返信する方法を紹介します。',
        'https://youtu.be/L3HF6zRPu24', 'slide-10'),
      (12, 2, 'Googleフォーム活用', 'フォームの自動更新',
        E'Google Apps Script (GAS) を使用して Google フォームの回答状況を自動的に集計し、リアルタイムで表示する方法について解説します。イベント参加フォームにおいて、現在の参加予定者数を説明欄に自動表示し、定員に達したら自動的に回答受付を終了する仕組みを実装します。',
        'https://youtu.be/8YBc5eqzBpg', 'slide-11'),
      (13, 2, 'Googleフォーム活用', 'フォーム回答集計',
        E'GASを使用することで、フォームの回答を自動的に集計し、見やすい形でスプレッドシートに出力することができます。フォーム回答の自動集計を行うGASコードの詳細な解説と実装方法をご紹介します。このスクリプトを使用することで、回答データの項目別集計や回答数のカウントを自動化し、効率的なデータ分析を実現できます。',
        'https://youtu.be/WEr1zTu_N3o', 'slide-12'),
      (14, 3, 'Googleカレンダー活用', 'カレンダー予定出力',
        E'Googleカレンダー上の予定を、スプレッドシートに出力する方法を紹介します。',
        'https://youtu.be/ybQ_G5JKg-0', 'slide-13'),
      (15, 3, 'Googleカレンダー活用', 'カレンダー一括予定登録',
        E'GASを使って、Googleスプレッドシートに入力された予定情報をGoogleカレンダーに自動で登録するアプリの解説を行います。このスクリプトを活用することで、会議やイベントなどの予定をスプレッドシートで一括管理し、それらをワンクリックでGoogleカレンダーに反映することが可能になります。特に、複数の予定を手動でカレンダーに登録する手間を省きたい方や、業務効率化を目指すチームにとって非常に便利なツールです。',
        'https://youtu.be/ZZ6UbHtARzE', 'slide-14'),
      (16, 3, 'Googleカレンダー活用', 'フォームを使った予定登録',
        E'GoogleフォームからGoogleカレンダーに予定を登録する方法を紹介します。',
        'https://youtu.be/ykcUoHGCgC0', 'slide-15'),
      (17, 4, 'Googleドキュメント活用', 'ドキュメント自動生成',
        E'事前に準備したテンプレートドキュメントをもとに、指定したタイミングでドキュメントを自動で生成する方法を紹介します。',
        'https://youtu.be/ukbOD9793b8', 'slide-16'),
      (18, 4, 'Googleドキュメント活用', 'ドキュメントの自動翻訳',
        E'GASのLanguageAppクラス、translateメソッドを用いて、Googleドキュメントの内容を日本語→英語、英語→日本語に翻訳する方法を解説します。',
        'https://youtu.be/HJ0_3RwmYdA', 'slide-17'),
      (19, 5, 'その他GAS活用', 'ChatGPTを使ったAIキャラクター作り',
        E'chatGPTとGASを連携して、作成したAIキャラクターと会話するスクリプトを作成します。',
        'https://youtu.be/UN3pdLs1bT8', 'slide-18'),
      (20, 5, 'その他GAS活用', 'ドライブ内のファイル出力',
        E'Googleドライブの指定のフォルダ内のすべてのファイル情報をスプレッドシートに出力する方法を紹介します。',
        'https://youtu.be/EhjAGiHD0G0', 'slide-19'),
      (21, 5, 'その他GAS活用', 'GoogleAnalyticsデータの自動出力',
        E'GoogleAnalytics APIを使用して、Analytics上のデータを取得してスプレッドシートに出力するアプリを開発する方法を紹介します。',
        'https://youtu.be/SWqRgmU6rrI', NULL),
      (22, 5, 'その他GAS活用', 'Slack通知フォーム',
        E'slack APIを使って、事前に準備した文章をslackに投稿する方法を紹介します。',
        'https://youtu.be/fP0mXgURsk8', NULL),
      (23, 5, 'その他GAS活用', 'ひとこと掲示板Webアプリ',
        E'GASによるWebアプリ開発とは / GASによるWebアプリのデプロイ / スプレッドシートとWebの掲示板を連携するアプリを作ろう\n\n[スライド]\nhttps://docs.google.com/presentation/d/1Rv4w2GNZVceKycRFJuzRUV-r6c7f3sGIZ6OTCqGdDIo/edit?usp=sharing\n\n[サンプル スプレッドシート]\nhttps://docs.google.com/spreadsheets/d/1y22-yig3DF-QlRg3yDS6L-1yvTqQ_WJSOP_EekNVTAU/edit?usp=drive_link',
        'https://youtu.be/-S-YtVUX4dM', 'slide-20'),
      -- #168: 本番の実際の所属フェーズは「その他GAS活用」ではなく「Googleドキュメント活用」
      (24, 4, 'Googleドキュメント活用', 'Geminiを使ったドキュメント自動要約',
        E'GeminiのAPIを呼び出し、Googleドキュメントの内容を要約します\n- google Geminiとは\n- ドキュメント内容の取得、Gemini用プロンプトの作成、Gemini API利用設定\n- 要約結果をドキュメントに追記\n\n[スライド]\nhttps://docs.google.com/presentation/d/1GK3F7MV2Igbq1WarCsPHR6_E5yYc8rpq7fgQhyynWNQ/edit\n[サンプルドキュメント]\nhttps://docs.google.com/document/d/1aBwOMguZEosEVBXppZ5IPup26SgkPy8pFMYMSW-5baQ/edit',
        'https://youtu.be/kD3OZ-TWlZg', 'slide-21')
    ) AS t(ordinal, phase_no, phase_name, topic, descr, video_url, slide)
    ORDER BY phase_no, ordinal
  LOOP
    -- フェーズ get-or-create
    SELECT id INTO v_phase_id FROM learning_phases
      WHERE theme_id = v_theme_id AND name = r.phase_name;
    IF v_phase_id IS NULL THEN
      INSERT INTO learning_phases (theme_id, name, display_order, is_published)
      VALUES (v_theme_id, r.phase_name, r.phase_no, false)
      RETURNING id INTO v_phase_id;
    END IF;

    -- フェーズが変わったら週カウンタをリセット
    IF v_cur_phase IS DISTINCT FROM r.phase_name THEN
      v_cur_phase := r.phase_name;
      v_week_order := 0;
    END IF;
    v_week_order := v_week_order + 1;
    -- #168: 本番の実際の display_order は 1,2 の次が 6（3〜5は欠番）。
    -- カウンタ（v_week_order）はそのまま自然な連番として進め、挿入値のみ上書きする。
    v_insert_order := v_week_order;
    IF r.topic = 'Geminiを使ったドキュメント自動要約' THEN
      v_insert_order := 6;
    END IF;

    -- 週 get-or-create（概要を description に格納）
    SELECT id INTO v_week_id FROM learning_weeks
      WHERE phase_id = v_phase_id AND name = r.topic;
    IF v_week_id IS NULL THEN
      INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
      VALUES (v_phase_id, r.topic, r.descr, v_insert_order, false)
      RETURNING id INTO v_week_id;
    END IF;

    -- 動画コンテンツ
    IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'video') THEN
      INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
      VALUES (v_week_id, r.topic || '（動画）', 'video', r.video_url, 1, false);
    END IF;

    -- スライドコンテンツ（PDFがあるトピックのみ）
    IF r.slide IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM learning_contents WHERE week_id = v_week_id AND content_type = 'slide') THEN
        INSERT INTO learning_contents (week_id, title, content_type, pdf_url, display_order, is_published)
        VALUES (v_week_id, r.topic || '（スライド）', 'slide',
          '/storage/v1/object/public/slides/gas-practical/' || r.slide || '.pdf', 2, false);
      END IF;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- サンプルデータ（開発環境用）
-- supabase db reset 時に自動実行されます
-- 本番環境では実行されません
-- =====================================================

-- デフォルトテーマ（004マイグレーションで作成済みの場合はスキップ）
INSERT INTO learning_themes (name, description, display_order, is_published)
SELECT 'GAS学習', 'Google Apps Scriptを使った自動化と開発の基礎を学びます', 1, true
WHERE NOT EXISTS (SELECT 1 FROM learning_themes WHERE name = 'GAS学習');

-- Phase 1: GAS基礎
INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
VALUES (
  (SELECT id FROM learning_themes WHERE name = 'GAS学習' LIMIT 1),
  'Phase 1 - GAS基礎',
  'Google Apps Scriptの基礎を学びます。スプレッドシートの操作やトリガーの設定などを習得します。',
  1,
  true
);

-- Phase 2: Web API基礎
INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
VALUES (
  (SELECT id FROM learning_themes WHERE name = 'GAS学習' LIMIT 1),
  'Phase 2 - Web API基礎',
  'Web APIの基本概念とHTTPリクエストの仕組みを学びます。',
  2,
  true
);

-- Phase 3: フロントエンド基礎
INSERT INTO learning_phases (theme_id, name, description, display_order, is_published)
VALUES (
  (SELECT id FROM learning_themes WHERE name = 'GAS学習' LIMIT 1),
  'Phase 3 - フロントエンド基礎',
  'HTML、CSS、JavaScriptを使ったフロントエンド開発の基礎を学びます。',
  3,
  false
);

-- Week 1-1: はじめの一歩
INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
VALUES (
  (SELECT id FROM learning_phases WHERE name = 'Phase 1 - GAS基礎' LIMIT 1),
  'Week 1 - はじめの一歩',
  'GASの概要と開発環境のセットアップを行います。',
  1,
  true
);

-- Week 1-2: スプレッドシート操作
INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
VALUES (
  (SELECT id FROM learning_phases WHERE name = 'Phase 1 - GAS基礎' LIMIT 1),
  'Week 2 - スプレッドシート操作',
  'スプレッドシートの読み書きを学びます。',
  2,
  true
);

-- Week 2-1: HTTPリクエスト
INSERT INTO learning_weeks (phase_id, name, description, display_order, is_published)
VALUES (
  (SELECT id FROM learning_phases WHERE name = 'Phase 2 - Web API基礎' LIMIT 1),
  'Week 1 - HTTPリクエスト',
  'GETとPOSTリクエストの基本を学びます。',
  1,
  true
);

-- Contents for Week 1-1
INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
VALUES (
  (SELECT id FROM learning_weeks WHERE name = 'Week 1 - はじめの一歩' LIMIT 1),
  'GASとは？',
  'video',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  1,
  true
);

INSERT INTO learning_contents (week_id, title, content_type, text_content, display_order, is_published)
VALUES (
  (SELECT id FROM learning_weeks WHERE name = 'Week 1 - はじめの一歩' LIMIT 1),
  '開発環境のセットアップ',
  'text',
  '## 開発環境のセットアップ

### 1. Google アカウントの準備

まず、Googleアカウントが必要です。まだ持っていない場合は作成してください。

### 2. Google Apps Script エディタへのアクセス

1. Google ドライブを開きます
2. 「新規」→「その他」→「Google Apps Script」を選択
3. スクリプトエディタが開きます

### 3. 最初のスクリプト

```javascript
function myFunction() {
  Logger.log("Hello, GAS!");
}
```

上記のコードを入力して実行してみましょう！',
  2,
  true
);

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, display_order, is_published)
VALUES (
  (SELECT id FROM learning_weeks WHERE name = 'Week 1 - はじめの一歩' LIMIT 1),
  '演習: 最初のスクリプト',
  'exercise',
  '## 演習課題

### 目標
GASで簡単なスクリプトを作成し、実行できるようになる。

### 課題内容
1. 新しいGASプロジェクトを作成してください
2. 以下の機能を持つスクリプトを作成してください：
   - 現在の日付と時刻をログに出力する
   - 自分の名前を含むメッセージを出力する

### 提出方法
作成したスクリプトのコードをコピーして提出してください。

### ヒント
- `new Date()` で現在の日時を取得できます
- `Logger.log()` でログに出力できます',
  3,
  true
);

-- Contents for Week 1-2
INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
VALUES (
  (SELECT id FROM learning_weeks WHERE name = 'Week 2 - スプレッドシート操作' LIMIT 1),
  'スプレッドシートの読み込み',
  'video',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  1,
  true
);

INSERT INTO learning_contents (week_id, title, content_type, text_content, display_order, is_published)
VALUES (
  (SELECT id FROM learning_weeks WHERE name = 'Week 2 - スプレッドシート操作' LIMIT 1),
  'スプレッドシートへの書き込み',
  'text',
  '## スプレッドシートへの書き込み

### 基本的な書き込み方法

```javascript
function writeToSheet() {
  const sheet = SpreadsheetApp.getActiveSheet();

  // 単一セルへの書き込み
  sheet.getRange("A1").setValue("Hello");

  // 複数セルへの書き込み
  sheet.getRange("A2:B2").setValues([["Name", "Age"]]);
}
```

### ポイント
- `setValue()` は単一の値を設定
- `setValues()` は2次元配列で複数の値を設定
- 範囲指定には A1 記法が使えます',
  2,
  true
);

-- Contents for Week 2-1
INSERT INTO learning_contents (week_id, title, content_type, video_url, display_order, is_published)
VALUES (
  (SELECT id FROM learning_weeks WHERE name = 'Week 1 - HTTPリクエスト' LIMIT 1),
  'HTTP通信の基礎',
  'video',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  1,
  true
);

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, display_order, is_published)
VALUES (
  (SELECT id FROM learning_weeks WHERE name = 'Week 1 - HTTPリクエスト' LIMIT 1),
  '演習: APIを呼び出してみよう',
  'exercise',
  '## 演習課題

### 目標
外部APIを呼び出してデータを取得できるようになる。

### 課題内容
1. 公開APIからデータを取得するスクリプトを作成してください
2. 取得したデータをスプレッドシートに書き込んでください

### 推奨API
- JSONPlaceholder: https://jsonplaceholder.typicode.com/

### 提出方法
- 作成したスクリプトのURL
- または、スクリプトのコードをコピーして提出

### ヒント
```javascript
const response = UrlFetchApp.fetch("https://api.example.com/data");
const json = JSON.parse(response.getContentText());
```',
  2,
  true
);

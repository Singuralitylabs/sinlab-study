-- =====================================================
-- GAS学習（応用編） 演習コンテンツの一括登録
-- contents/gas-advanced/ の課題・ヒント・模範回答を learning_contents に登録
-- content_type = 'exercise'、display_order は video/slide の後に連番
-- hint カラムも同時に投入（管理画面UIからのヒント入力は未実装のため。issue #48）
-- 週は theme='GAS学習（応用編）' + week.name で特定し、NOT EXISTS で冪等化
-- =====================================================

-- ====================================================
-- Phase 1 / Week: GASとHTMLの基礎
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題1-1: Webアプリで文字を表示する', 'exercise', $i$
ウェブアプリにアクセスすると「ようこそ！」という見出しが表示されるスクリプトを作成してください。
$i$, $a$
function doGet() {
  return HtmlService.createHtmlOutput("<h1>ようこそ！</h1>");
}
$a$, $hint$
- ウェブアプリは `doGet()` 関数の戻り値を画面に表示します
- `HtmlService.createHtmlOutput("HTML文字列")` でHTMLを返せます
- 見出しは `<h1>` タグで表現します
- 公開は「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」で行います
$hint$, 'code', 'html', 3, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'GASとHTMLの基礎'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題1-1: Webアプリで文字を表示する'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題1-2: HTMLファイルを読み込んで表示する', 'exercise', $i$
`index.html` というHTMLファイルを作成し、見出し・段落・箇条書きリストを含むページをウェブアプリで表示してください。$i$, $a$
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index");
}

<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <h1>学習メモ</h1>
    <p>今日学んだことをまとめます。</p>
    <ul>
      <li>doGet関数</li>
      <li>HtmlService</li>
      <li>HTMLの基礎</li>
    </ul>
  </body>
</html>
$a$, $hint$
- エディタの「＋」→「HTML」でHTMLファイルを追加できます（拡張子 `.html` は付けません）
- `HtmlService.createHtmlOutputFromFile("ファイル名")` でHTMLファイルを読み込みます
- 段落は `<p>`、箇条書きは `<ul>` と `<li>` を使います
$hint$, 'code', 'html', 4, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'GASとHTMLの基礎'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題1-2: HTMLファイルを読み込んで表示する'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題1-3: 自己紹介ページを作る', 'exercise', $i$
画像・リンク・リストを組み合わせた自己紹介ページをHTMLで作成し、ウェブアプリで公開してください。
$i$, $a$
<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <h1>自己紹介</h1>
    <img src="https://placehold.jp/150x150.png" alt="プロフィール画像">
    <p>はじめまして。GASでWebアプリ開発を学んでいます。</p>
    <h2>好きなこと</h2>
    <ul>
      <li>プログラミング</li>
      <li>読書</li>
      <li>旅行</li>
    </ul>
    <p><a href="https://www.google.com" target="_blank">参考リンク</a></p>
  </body>
</html>
$a$, $hint$
- 画像は `<img src="画像URL">`、リンクは `<a href="URL">テキスト</a>` で記述します
- リンクを新しいタブで開くには `target="_blank"` を付けます
- `<base target="_top">` を `<head>` に入れると、GASのiframe内でリンクが正しく開きます
$hint$, 'code', 'html', 5, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'GASとHTMLの基礎'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題1-3: 自己紹介ページを作る'
  );

-- ====================================================
-- Phase 1 / Week: GASとCSSの基礎
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題2-1: 文字色と背景色を変える', 'exercise', $i$
見出しの文字色を白、ページ全体の背景色を紺色（navy）にしたページを作成してください。
$i$, $a$
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
    <style>
      body {
        background-color: navy;
      }
      h1 {
        color: white;
      }
    </style>
  </head>
  <body>
    <h1>こんにちは</h1>
  </body>
</html>
$a$, $hint$
- CSSは `<head>` 内の `<style>` 〜 `</style>` に記述します
- 文字色は `color`、背景色は `background-color` プロパティで指定します
- ページ全体に適用するには `body` セレクタを使います
$hint$, 'code', 'html', 3, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'GASとCSSの基礎'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題2-1: 文字色と背景色を変える'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題2-2: classで複数の要素をまとめて装飾する', 'exercise', $i$
class属性を使い、複数の段落に同じスタイル（黄色の背景・文字を中央寄せ）を適用してください。
$i$, $a$
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
    <style>
      .highlight {
        background-color: yellow;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <p class="highlight">重要なお知らせ1</p>
    <p>通常の段落</p>
    <p class="highlight">重要なお知らせ2</p>
  </body>
</html>
$a$, $hint$
- HTML要素に `class="クラス名"` を付けます
- CSSでは `.クラス名` でclassを指定します（先頭にドット）
- 中央寄せは `text-align: center;` です
$hint$, 'code', 'html', 4, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'GASとCSSの基礎'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題2-2: classで複数の要素をまとめて装飾する'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題2-3: idで特定の要素を装飾する', 'exercise', $i$
id属性を使い、特定の見出しだけ文字色を赤・フォントサイズを大きく装飾してください。
$i$, $a$
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
    <style>
      #title {
        color: red;
        font-size: 32px;
      }
    </style>
  </head>
  <body>
    <h1 id="title">特大タイトル</h1>
    <h1>通常の見出し</h1>
  </body>
</html>
$a$, $hint$
- HTML要素に `id="ID名"` を付けます（idはページ内で一意にします）
- CSSでは `#ID名` でidを指定します（先頭にシャープ）
- フォントサイズは `font-size: 32px;` のように指定します
$hint$, 'code', 'html', 5, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'GASとCSSの基礎'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題2-3: idで特定の要素を装飾する'
  );

-- ====================================================
-- Phase 1 / Week: CSSフレームワーク
-- （既存コンテンツが slide=2 / video=3 のため演習は display_order 4〜）
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題3-1: Tailwind CSSでボタンを装飾する', 'exercise', $i$
Tailwind CSSをCDNで読み込み、青色の背景・白文字・角丸のボタンを作成してください。
$i$, $a$
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <button class="bg-blue-500 text-white rounded px-4 py-2">送信</button>
  </body>
</html>
$a$, $hint$
- `<head>` に `<script src="https://cdn.tailwindcss.com"></script>` を追加するとTailwindが使えます
- 背景色は `bg-blue-500`、文字色は `text-white`、角丸は `rounded` クラスです
- 余白は `px-4 py-2`（左右・上下のpadding）で付けられます
$hint$, 'code', 'html', 4, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'CSSフレームワーク'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題3-1: Tailwind CSSでボタンを装飾する'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題3-2: Gridレイアウトでカードを並べる', 'exercise', $i$
Tailwind CSSのGridを使い、3枚のカードを横3列に並べて表示してください。
$i$, $a$
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="p-4">
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-gray-100 p-4 rounded">カード1</div>
      <div class="bg-gray-100 p-4 rounded">カード2</div>
      <div class="bg-gray-100 p-4 rounded">カード3</div>
    </div>
  </body>
</html>
$a$, $hint$
- 親要素に `grid grid-cols-3 gap-4` を付けると3列のグリッドになります
- `gap-4` はカード同士の間隔です
- カードは `bg-gray-100 p-4 rounded` などで装飾します
$hint$, 'code', 'html', 5, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'CSSフレームワーク'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題3-2: Gridレイアウトでカードを並べる'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題3-3: レスポンシブ対応のグリッドを作る', 'exercise', $i$
画面幅に応じて列数が変わるグリッドを作成してください。スマホでは1列、タブレット以上（md）では3列に表示します。$i$, $a$
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="p-4">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-gray-100 p-4 rounded">項目1</div>
      <div class="bg-gray-100 p-4 rounded">項目2</div>
      <div class="bg-gray-100 p-4 rounded">項目3</div>
    </div>
  </body>
</html>
$a$, $hint$
- レスポンシブ対応には、ウェブアプリ側でviewportの設定が必要です（`doGet` で `addMetaTag`）
- Tailwindは `md:` などの接頭辞で画面幅ごとのスタイルを指定します
- `grid-cols-1 md:grid-cols-3` で「標準は1列・md以上で3列」になります
$hint$, 'code', 'html', 6, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'CSSフレームワーク'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題3-3: レスポンシブ対応のグリッドを作る'
  );

-- ====================================================
-- Phase 2 / Week: スプレッドシートのWebアプリ公開
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題4-1: セルの値をWebアプリに表示する', 'exercise', $i$
スプレッドシートのA1セルの値を取得し、Webアプリの見出しとして表示してください。$i$, $a$
// コード.gs
function doGet() {
  const template = HtmlService.createTemplateFromFile("index");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  template.title = sheet.getRange("A1").getValue();
  return template.evaluate();
}

<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <h1><?= title ?></h1>
  </body>
</html>
$a$, $hint$
- テンプレートを使うには `HtmlService.createTemplateFromFile("index").evaluate()` を使います
- HTMLファイル内の `<?= 値 ?>` にサーバー側の値を埋め込めます
- テンプレートのプロパティ（例: `template.title`）に値を代入して渡します
$hint$, 'code', 'html', 3, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'スプレッドシートのWebアプリ公開'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題4-1: セルの値をWebアプリに表示する'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題4-2: スプレッドシートの一覧をテーブルで表示する', 'exercise', $i$
スプレッドシートの全データを取得し、HTMLのテーブルとして一覧表示してください。$i$, $a$
// コード.gs
function doGet() {
  const template = HtmlService.createTemplateFromFile("index");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  template.data = sheet.getDataRange().getValues();
  return template.evaluate();
}

<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <table border="1">
      <? for (const row of data) { ?>
        <tr>
          <? for (const cell of row) { ?>
            <td><?= cell ?></td>
          <? } ?>
        </tr>
      <? } ?>
    </table>
  </body>
</html>
$a$, $hint$
- `sheet.getDataRange().getValues()` で全データを2次元配列で取得できます
- テンプレート内では `<? for (...) { ?>` 〜 `<? } ?>` でループ処理が書けます
- 表は `<table>`・`<tr>`（行）・`<td>`（セル）で作ります
$hint$, 'code', 'html', 4, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'スプレッドシートのWebアプリ公開'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題4-2: スプレッドシートの一覧をテーブルで表示する'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題4-3: ボタンを押してデータ件数を取得する', 'exercise', $i$
ボタンをクリックすると、`google.script.run` でサーバー関数を呼び出し、スプレッドシートのデータ件数を画面に表示してください。$i$, $a$
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index");
}

function getRowCount() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  return sheet.getLastRow();
}

<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <button onclick="loadCount()">件数を取得</button>
    <p id="result"></p>
    <script>
      function loadCount() {
        google.script.run
          .withSuccessHandler(function(count) {
            document.getElementById("result").innerText = count + "件のデータがあります";
          })
          .getRowCount();
      }
    </script>
  </body>
</html>
$a$, $hint$
- クライアント側のJavaScriptから `google.script.run.関数名()` でサーバー関数を呼べます
- 戻り値は `.withSuccessHandler(コールバック関数)` で受け取ります
- サーバー関数は `doGet` とは別に定義します（例: `getRowCount`）
$hint$, 'code', 'html', 5, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'スプレッドシートのWebアプリ公開'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題4-3: ボタンを押してデータ件数を取得する'
  );

-- ====================================================
-- Phase 2 / Week: フォーム回答結果のWebアプリ公開
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題5-1: 入力フォームを作る', 'exercise', $i$
名前とメッセージを入力できるHTMLフォームを作成し、Webアプリで表示してください。
$i$, $a$
<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <h1>お問い合わせ</h1>
    <p>お名前：<input type="text" id="name"></p>
    <p>メッセージ：<textarea id="message"></textarea></p>
    <button onclick="submitForm()">送信</button>
  </body>
</html>
$a$, $hint$
- 1行入力は `<input type="text">`、複数行入力は `<textarea>` を使います
- 各入力欄に `id` を付けると、JavaScriptから値を取得しやすくなります
- 送信ボタンは `<button>` で作ります
$hint$, 'code', 'html', 3, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'フォーム回答結果のWebアプリ公開'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題5-1: 入力フォームを作る'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題5-2: フォームの内容をスプレッドシートに保存する', 'exercise', $i$
フォームに入力した名前とメッセージを、`google.script.run` でスプレッドシートに保存してください。$i$, $a$
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index");
}

function saveData(name, message) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([new Date(), name, message]);
}

<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <h1>お問い合わせ</h1>
    <p>お名前：<input type="text" id="name"></p>
    <p>メッセージ：<textarea id="message"></textarea></p>
    <button onclick="submitForm()">送信</button>
    <p id="status"></p>
    <script>
      function submitForm() {
        const name = document.getElementById("name").value;
        const message = document.getElementById("message").value;
        google.script.run
          .withSuccessHandler(function() {
            document.getElementById("status").innerText = "送信しました！";
          })
          .saveData(name, message);
      }
    </script>
  </body>
</html>
$a$, $hint$
- 入力値は `document.getElementById("id").value` で取得します
- `google.script.run.saveData(name, message)` のように引数で値を渡せます
- サーバー側では `sheet.appendRow([...])` で行を追加します
$hint$, 'code', 'html', 4, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'フォーム回答結果のWebアプリ公開'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題5-2: フォームの内容をスプレッドシートに保存する'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, hint, allowed_submission_types, code_language, display_order, is_published)
SELECT w.id, '課題5-3: 回答結果を一覧表示する', 'exercise', $i$
フォーム送信後に、これまでに保存された回答の一覧をWebアプリ上に表示してください。$i$, $a$
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index");
}

function saveData(name, message) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([new Date(), name, message]);
}

function getMessages() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  return sheet.getDataRange().getValues();
}

<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <h1>お問い合わせ</h1>
    <p>お名前：<input type="text" id="name"></p>
    <p>メッセージ：<textarea id="message"></textarea></p>
    <button onclick="submitForm()">送信</button>

    <h2>これまでの回答</h2>
    <ul id="list"></ul>

    <script>
      function submitForm() {
        const name = document.getElementById("name").value;
        const message = document.getElementById("message").value;
        google.script.run
          .withSuccessHandler(loadMessages)
          .saveData(name, message);
      }

      function loadMessages() {
        google.script.run
          .withSuccessHandler(function(rows) {
            const list = document.getElementById("list");
            list.innerHTML = "";
            for (const row of rows) {
              const li = document.createElement("li");
              li.innerText = row[1] + "：" + row[2];
              list.appendChild(li);
            }
          })
          .getMessages();
      }

      // 初回表示
      loadMessages();
    </script>
  </body>
</html>
$a$, $hint$
- 保存済みデータを返すサーバー関数（例: `getMessages`）を用意します
- 送信成功後のハンドラー内で、再度 `google.script.run` を呼んで一覧を更新します
- 取得した2次元配列をJavaScriptでループしてHTMLに反映します
$hint$, 'code', 'html', 5, true
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE t.name = 'GAS学習（応用編）' AND w.name = 'フォーム回答結果のWebアプリ公開'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題5-3: 回答結果を一覧表示する'
  );

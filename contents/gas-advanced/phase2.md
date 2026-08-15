# Phase 2 - Webアプリ公開

スプレッドシートやフォームのデータをWebアプリに反映する方法を学びます。

---

## Week 2-1: スプレッドシートのWebアプリ公開

### 学習トピック
- HTMLテンプレート（スクリプトレット）
- サーバー関数でのスプレッドシートデータ取得
- テンプレートへの値の埋め込み（`<?= ?>`）
- スプレッドシートの内容をテーブルで表示
- google.script.runによるクライアント→サーバー通信

### 動画
[スプレッドシートのWebアプリ公開（動画）](https://www.youtube.com/watch?v=62YBEUqeMYk)

### スライド
[スプレッドシートのWebアプリ公開（スライド）]({{SUPABASE_STORAGE_URL}}/slides/gas-advanced/slide-04.pdf)

### 課題

#### 課題4-1: セルの値をWebアプリに表示する

スプレッドシートのA1セルの値を取得し、Webアプリの見出しとして表示してください。

<details>
<summary>ヒント</summary>

- テンプレートを使うには `HtmlService.createTemplateFromFile("index").evaluate()` を使います
- HTMLファイル内の `<?= 値 ?>` にサーバー側の値を埋め込めます
- テンプレートのプロパティ（例: `template.title`）に値を代入して渡します

</details>

<details>
<summary>模範回答</summary>

```javascript
// コード.gs
function doGet() {
  const template = HtmlService.createTemplateFromFile("index");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  template.title = sheet.getRange("A1").getValue();
  return template.evaluate();
}
```

```html
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
```

</details>

---

#### 課題4-2: スプレッドシートの一覧をテーブルで表示する

スプレッドシートの全データを取得し、HTMLのテーブルとして一覧表示してください。

<details>
<summary>ヒント</summary>

- `sheet.getDataRange().getValues()` で全データを2次元配列で取得できます
- テンプレート内では `<? for (...) { ?>` 〜 `<? } ?>` でループ処理が書けます
- 表は `<table>`・`<tr>`（行）・`<td>`（セル）で作ります

</details>

<details>
<summary>模範回答</summary>

```javascript
// コード.gs
function doGet() {
  const template = HtmlService.createTemplateFromFile("index");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  template.data = sheet.getDataRange().getValues();
  return template.evaluate();
}
```

```html
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
```

</details>

---

#### 課題4-3: ボタンを押してデータ件数を取得する

ボタンをクリックすると、`google.script.run` でサーバー関数を呼び出し、スプレッドシートのデータ件数を画面に表示してください。

<details>
<summary>ヒント</summary>

- クライアント側のJavaScriptから `google.script.run.関数名()` でサーバー関数を呼べます
- 戻り値は `.withSuccessHandler(コールバック関数)` で受け取ります
- サーバー関数は `doGet` とは別に定義します（例: `getRowCount`）

</details>

<details>
<summary>模範回答</summary>

```javascript
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index");
}

function getRowCount() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  return sheet.getLastRow();
}
```

```html
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
```

</details>

---

## Week 2-2: フォームのWebアプリ公開

### 学習トピック
- HTMLフォームの作成（input・textarea・button）
- google.script.runによるフォームデータの送信
- フォームデータのスプレッドシートへの保存
- 成功ハンドラー（withSuccessHandler）
- 回答結果の一覧表示

### 動画
[フォームのWebアプリ公開（動画）](https://www.youtube.com/watch?v=oUmvnQDoIUI)

### スライド
[フォームのWebアプリ公開（スライド）]({{SUPABASE_STORAGE_URL}}/slides/gas-advanced/slide-05.pdf)

### 課題

#### 課題5-1: 入力フォームを作る

名前とメッセージを入力できるHTMLフォームを作成し、Webアプリで表示してください。

<details>
<summary>ヒント</summary>

- 1行入力は `<input type="text">`、複数行入力は `<textarea>` を使います
- 各入力欄に `id` を付けると、JavaScriptから値を取得しやすくなります
- 送信ボタンは `<button>` で作ります

</details>

<details>
<summary>模範回答</summary>

```html
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
```

</details>

---

#### 課題5-2: フォームの内容をスプレッドシートに保存する

フォームに入力した名前とメッセージを、`google.script.run` でスプレッドシートに保存してください。

<details>
<summary>ヒント</summary>

- 入力値は `document.getElementById("id").value` で取得します
- `google.script.run.saveData(name, message)` のように引数で値を渡せます
- サーバー側では `sheet.appendRow([...])` で行を追加します

</details>

<details>
<summary>模範回答</summary>

```javascript
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index");
}

function saveData(name, message) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([new Date(), name, message]);
}
```

```html
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
```

</details>

---

#### 課題5-3: 回答結果を一覧表示する

フォーム送信後に、これまでに保存された回答の一覧をWebアプリ上に表示してください。

<details>
<summary>ヒント</summary>

- 保存済みデータを返すサーバー関数（例: `getMessages`）を用意します
- 送信成功後のハンドラー内で、再度 `google.script.run` を呼んで一覧を更新します
- 取得した2次元配列をJavaScriptでループしてHTMLに反映します

</details>

<details>
<summary>模範回答</summary>

```javascript
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
```

```html
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
```

</details>

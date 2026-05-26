# Phase 1 - Web開発の基礎

GASでWebアプリケーションを公開する仕組みと、HTML/CSSによる画面作成の基礎を学びます。

---

## Week 1-1: GASとHTMLの基礎

### 学習トピック
- GASによるWebアプリケーション公開の仕組み（doGet関数）
- HtmlServiceの役割
- HTMLファイルの作成と読み込み
- ウェブアプリとしてのデプロイ
- HTMLの基礎（タグ・要素・属性）
- 見出し・段落・リスト・リンク・画像

### 動画
[GASとHTMLの基礎（動画）](https://www.youtube.com/watch?v=E11ZBQwNCxg)

### スライド
[GASとHTMLの基礎（スライド）]({{SUPABASE_STORAGE_URL}}/slides/gas-advanced/slide-01.pdf)

### 課題

#### 課題1-1: Webアプリで文字を表示する

ウェブアプリにアクセスすると「ようこそ！」という見出しが表示されるスクリプトを作成してください。

<details>
<summary>ヒント</summary>

- ウェブアプリは `doGet()` 関数の戻り値を画面に表示します
- `HtmlService.createHtmlOutput("HTML文字列")` でHTMLを返せます
- 見出しは `<h1>` タグで表現します
- 公開は「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」で行います

</details>

<details>
<summary>模範回答</summary>

```javascript
function doGet() {
  return HtmlService.createHtmlOutput("<h1>ようこそ！</h1>");
}
```

</details>

---

#### 課題1-2: HTMLファイルを読み込んで表示する

`index.html` というHTMLファイルを作成し、見出し・段落・箇条書きリストを含むページをウェブアプリで表示してください。

<details>
<summary>ヒント</summary>

- エディタの「＋」→「HTML」でHTMLファイルを追加できます（拡張子 `.html` は付けません）
- `HtmlService.createHtmlOutputFromFile("ファイル名")` でHTMLファイルを読み込みます
- 段落は `<p>`、箇条書きは `<ul>` と `<li>` を使います

</details>

<details>
<summary>模範回答</summary>

```javascript
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index");
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
    <h1>学習メモ</h1>
    <p>今日学んだことをまとめます。</p>
    <ul>
      <li>doGet関数</li>
      <li>HtmlService</li>
      <li>HTMLの基礎</li>
    </ul>
  </body>
</html>
```

</details>

---

#### 課題1-3: 自己紹介ページを作る

画像・リンク・リストを組み合わせた自己紹介ページをHTMLで作成し、ウェブアプリで公開してください。

<details>
<summary>ヒント</summary>

- 画像は `<img src="画像URL">`、リンクは `<a href="URL">テキスト</a>` で記述します
- リンクを新しいタブで開くには `target="_blank"` を付けます
- `<base target="_top">` を `<head>` に入れると、GASのiframe内でリンクが正しく開きます

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
```

</details>

---

## Week 1-2: GASとCSSの基礎

### 学習トピック
- CSSとは
- CSSの記述場所（style要素）
- 文字色（color）と背景色（background-color）
- フォントサイズ・文字寄せ
- セレクタ（要素・class・id）
- class属性とid属性による装飾

### 動画
[GASとCSSの基礎（動画）](https://www.youtube.com/watch?v=qvCqIeOsMH8)

### スライド
[GASとCSSの基礎（スライド）]({{SUPABASE_STORAGE_URL}}/slides/gas-advanced/slide-02.pdf)

### 課題

#### 課題2-1: 文字色と背景色を変える

見出しの文字色を白、ページ全体の背景色を紺色（navy）にしたページを作成してください。

<details>
<summary>ヒント</summary>

- CSSは `<head>` 内の `<style>` 〜 `</style>` に記述します
- 文字色は `color`、背景色は `background-color` プロパティで指定します
- ページ全体に適用するには `body` セレクタを使います

</details>

<details>
<summary>模範回答</summary>

```html
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
```

</details>

---

#### 課題2-2: classで複数の要素をまとめて装飾する

class属性を使い、複数の段落に同じスタイル（黄色の背景・文字を中央寄せ）を適用してください。

<details>
<summary>ヒント</summary>

- HTML要素に `class="クラス名"` を付けます
- CSSでは `.クラス名` でclassを指定します（先頭にドット）
- 中央寄せは `text-align: center;` です

</details>

<details>
<summary>模範回答</summary>

```html
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
```

</details>

---

#### 課題2-3: idで特定の要素を装飾する

id属性を使い、特定の見出しだけ文字色を赤・フォントサイズを大きく装飾してください。

<details>
<summary>ヒント</summary>

- HTML要素に `id="ID名"` を付けます（idはページ内で一意にします）
- CSSでは `#ID名` でidを指定します（先頭にシャープ）
- フォントサイズは `font-size: 32px;` のように指定します

</details>

<details>
<summary>模範回答</summary>

```html
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
```

</details>

---

## Week 1-3: CSSフレームワーク

### 学習トピック
- CSSフレームワークとは
- Tailwind CSSの導入（CDN）
- ユーティリティクラスの使い方
- Gridレイアウト（grid / grid-cols）
- レスポンシブデザイン（ブレークポイント）

### 動画
[CSSフレームワーク（動画）](https://www.youtube.com/watch?v=xrh237CSi9k)

### スライド
[CSSフレームワーク（スライド）]({{SUPABASE_STORAGE_URL}}/slides/gas-advanced/slide-03.pdf)

### 課題

#### 課題3-1: Tailwind CSSでボタンを装飾する

Tailwind CSSをCDNで読み込み、青色の背景・白文字・角丸のボタンを作成してください。

<details>
<summary>ヒント</summary>

- `<head>` に `<script src="https://cdn.tailwindcss.com"></script>` を追加するとTailwindが使えます
- 背景色は `bg-blue-500`、文字色は `text-white`、角丸は `rounded` クラスです
- 余白は `px-4 py-2`（左右・上下のpadding）で付けられます

</details>

<details>
<summary>模範回答</summary>

```html
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
```

</details>

---

#### 課題3-2: Gridレイアウトでカードを並べる

Tailwind CSSのGridを使い、3枚のカードを横3列に並べて表示してください。

<details>
<summary>ヒント</summary>

- 親要素に `grid grid-cols-3 gap-4` を付けると3列のグリッドになります
- `gap-4` はカード同士の間隔です
- カードは `bg-gray-100 p-4 rounded` などで装飾します

</details>

<details>
<summary>模範回答</summary>

```html
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
```

</details>

---

#### 課題3-3: レスポンシブ対応のグリッドを作る

画面幅に応じて列数が変わるグリッドを作成してください。スマホでは1列、タブレット以上（md）では3列に表示します。

<details>
<summary>ヒント</summary>

- レスポンシブ対応には、ウェブアプリ側でviewportの設定が必要です（`doGet` で `addMetaTag`）
- Tailwindは `md:` などの接頭辞で画面幅ごとのスタイルを指定します
- `grid-cols-1 md:grid-cols-3` で「標準は1列・md以上で3列」になります

</details>

<details>
<summary>模範回答</summary>

```javascript
// コード.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}
```

```html
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
```

</details>

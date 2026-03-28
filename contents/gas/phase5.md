# Phase 5 - Googleフォーム

Googleフォームの作成・トリガー・DB操作を学びます。

---

## Week 5-1: Googleフォーム

### 学習トピック
- Googleフォームとは
- GoogleフォームのGAS活用事例
- Googleフォームへのアクセス
- フォームタイトル・説明文の取得
- Googleフォームの作成
- フォーム設問の作成・設定・削除

### 動画
[Googleフォーム（動画）](https://www.youtube.com/watch?v=7EmiOhVmkFs)

### スライド
[Googleフォーム（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-08.pdf)

### 課題

#### 課題8-1: フォームの作成

「アンケート」というタイトルのGoogleフォームをGASで作成し、フォームのURLをログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function createForm() {
  const form = FormApp.create("アンケート");

  console.log("フォームURL: " + form.getPublishedUrl());
}
```

</details>

---

#### 課題8-2: 設問の追加

「アンケート」フォームに以下の2つの設問を追加するスクリプトを作成してください。

1. テキスト設問「お名前を入力してください」（必須）
2. 段落設問「ご意見・ご感想をお聞かせください」

<details>
<summary>模範回答</summary>

```javascript
function addQuestions() {
  const form = FormApp.create("アンケート");

  // テキスト設問（必須）
  form.addTextItem()
    .setTitle("お名前を入力してください")
    .setRequired(true);

  // 段落設問
  form.addParagraphTextItem()
    .setTitle("ご意見・ご感想をお聞かせください");

  console.log("設問を追加しました: " + form.getPublishedUrl());
}
```

</details>

---

#### 課題8-3: フォームのタイトルと説明文の変更

既存のフォームのIDを指定し、タイトルを「満足度調査」、説明文を「サービスに関するアンケートです。ご協力をお願いします。」に変更するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function updateFormInfo() {
  const formId = "ここにフォームIDを入力";
  const form = FormApp.openById(formId);

  form.setTitle("満足度調査");
  form.setDescription("サービスに関するアンケートです。ご協力をお願いします。");

  console.log("タイトル: " + form.getTitle());
  console.log("説明: " + form.getDescription());
}
```

</details>

---

## Week 5-2: Googleフォームの活用

### 学習トピック
- トリガー機能
- フォーム回答の取得
- GoogleフォームによるDB操作

### 動画
[Googleフォームの活用（動画）](https://www.youtube.com/watch?v=ioq82NFX0Z4)

### スライド
[Googleフォームの活用（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-09.pdf)

### 課題

#### 課題9-1: フォーム送信トリガーの設定

フォームが送信されたときに実行される関数 `onFormSubmit` を作成し、「フォームが送信されました」とログに出力するスクリプトと、そのトリガーを登録するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
// フォーム送信時に実行される関数
function onFormSubmit(e) {
  console.log("フォームが送信されました");
}

// トリガーを登録する関数（一度だけ実行）
function createFormTrigger() {
  const formId = "ここにフォームIDを入力";
  const form = FormApp.openById(formId);

  ScriptApp.newTrigger("onFormSubmit")
    .forForm(form)
    .onFormSubmit()
    .create();

  console.log("トリガーを登録しました");
}
```

</details>

---

#### 課題9-2: 回答内容の取得

フォーム送信時に、回答者の各設問への回答をログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function onFormSubmit(e) {
  const responses = e.response.getItemResponses();

  for (const response of responses) {
    const question = response.getItem().getTitle();
    const answer = response.getResponse();

    console.log(question + ": " + answer);
  }
}
```

</details>

---

#### 課題9-3: 回答をスプレッドシートに保存

フォーム送信時に、送信日時・回答内容をスプレッドシートの最終行に追加するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function onFormSubmit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const responses = e.response.getItemResponses();
  const timestamp = new Date();

  const row = [timestamp];
  for (const response of responses) {
    row.push(response.getResponse());
  }

  sheet.appendRow(row);
  console.log("スプレッドシートに保存しました");
}
```

</details>

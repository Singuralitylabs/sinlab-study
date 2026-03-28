# Phase 4 - Gmailの送信

GASによるGmail送信とスプレッドシートを活用したメール配信システムを学びます。

---

## Week 4-1: Gmailの送信

### 学習トピック
- Gmailとは
- GASによるGmailの送信
- GASにおける文章の書き方
- スプレッドシートを用いた一括Gmail送信システム

### 動画
[Gmailの送信（動画）](https://www.youtube.com/watch?v=EjjHHt-oVKc)

### スライド
[Gmailの送信（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-07.pdf)

### 課題

#### 課題7-1: メールの送信

自分のメールアドレス宛に件名「GASテストメール」、本文「GASからメールを送信しました。」というメールを送信するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function sendTestMail() {
  const to = "your-email@example.com"; // 自分のメールアドレスに変更
  const subject = "GASテストメール";
  const body = "GASからメールを送信しました。";

  GmailApp.sendEmail(to, subject, body);
  console.log("メールを送信しました");
}
```

</details>

---

#### 課題7-2: 複数行の本文でメール送信

以下の情報を含む本文のメールを送信するスクリプトを作成してください。

```
件名: 【テスト】お知らせ
本文:
お世話になっております。

テスト送信です。
以上、よろしくお願いいたします。
```

<details>
<summary>模範回答</summary>

```javascript
function sendFormattedMail() {
  const to = "your-email@example.com"; // 自分のメールアドレスに変更
  const subject = "【テスト】お知らせ";
  const body = "お世話になっております。\n\nテスト送信です。\n以上、よろしくお願いいたします。";

  GmailApp.sendEmail(to, subject, body);
  console.log("メールを送信しました");
}
```

</details>

---

#### 課題7-3: スプレッドシートからの一括送信

スプレッドシートのA列に名前、B列にメールアドレスが入力されたリストを作成し、各人に「〇〇さん、こんにちは！」という内容のメールを一括送信するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function sendBulkMail() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(1, 1, lastRow, 2).getValues();

  for (const row of data) {
    const name = row[0];
    const email = row[1];

    const subject = "ご挨拶";
    const body = name + "さん、こんにちは！";

    GmailApp.sendEmail(email, subject, body);
    console.log(name + "さんにメールを送信しました");
  }
}
```

</details>

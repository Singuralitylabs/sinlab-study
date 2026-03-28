# Phase 7 - GASの便利な機能

プロパティストア・ダイアログ・ログ出力などGASの便利な機能を学びます。

---

## Week 7-1: GASの便利な機能

### 学習トピック
- プロパティストアへのデータ保存
- ダイアログの出力
- スプレッドシートからのGAS実行
- ログ出力の分類
- 関数のコメントの設定

### 動画
[GASの便利な機能（動画）](https://www.youtube.com/watch?v=vo87BAKkC8E)

### スライド
[GASの便利な機能（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-12.pdf)

### 課題

#### 課題12-1: プロパティストアへのデータ保存

スクリプトプロパティに「API_KEY」というキーで任意の文字列を保存し、その後取得してログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function saveAndGetProperty() {
  const properties = PropertiesService.getScriptProperties();

  // 保存
  properties.setProperty("API_KEY", "my-secret-api-key-12345");
  console.log("プロパティを保存しました");

  // 取得
  const apiKey = properties.getProperty("API_KEY");
  console.log("API_KEY: " + apiKey);
}
```

</details>

---

#### 課題12-2: ダイアログの表示

スプレッドシートのメニューから実行できる関数を作成し、「処理を実行しますか？」という確認ダイアログを表示してください。「OK」を押した場合は「実行しました」、「キャンセル」を押した場合は「キャンセルしました」とダイアログで表示してください。

<details>
<summary>模範回答</summary>

```javascript
function showConfirmDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "確認",
    "処理を実行しますか？",
    ui.ButtonSet.OK_CANCEL
  );

  if (response === ui.Button.OK) {
    ui.alert("実行しました");
  } else {
    ui.alert("キャンセルしました");
  }
}
```

</details>

---

#### 課題12-3: カスタムメニューの追加

スプレッドシートを開いたときに「GASツール」というカスタムメニューを追加し、その中に「データ集計」という項目を作成してください。「データ集計」をクリックすると「集計を実行します」とログに出力されるようにしてください。

<details>
<summary>模範回答</summary>

```javascript
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("GASツール")
    .addItem("データ集計", "aggregateData")
    .addToUi();
}

function aggregateData() {
  console.log("集計を実行します");
}
```

</details>

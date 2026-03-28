# Phase 3 - スプレッドシート活用

スプレッドシートの操作とデータベース活用を学びます。

---

## Week 3-1: スプレッドシート操作1

### 学習トピック
- スプレッドシートとは
- スプレッドシート・シート・セルへのアクセス
- シート内のセルの値の取得及び入力

### 動画
[スプレッドシート操作1（動画）](https://www.youtube.com/watch?v=wyx0KM46TwU)

### スライド
[スプレッドシート操作1（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-04.pdf)

### 課題

#### 課題4-1: セルへの値の入力

アクティブなスプレッドシートのA1セルに「こんにちは！」、B1セルに本日の日付をそれぞれ入力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function writeToCell() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  sheet.getRange("A1").setValue("こんにちは！");
  sheet.getRange("B1").setValue(new Date());
}
```

</details>

---

#### 課題4-2: セルの値の取得

A1セルに任意の文字列を手動で入力しておき、スクリプトでその値を取得してログに出力してください。

<details>
<summary>模範回答</summary>

```javascript
function readFromCell() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const value = sheet.getRange("A1").getValue();

  console.log("A1の値: " + value);
}
```

</details>

---

#### 課題4-3: シートの指定

スプレッドシートに「Sheet1」と「データ」の2つのシートを作成し、それぞれのシートのA1セルに異なる値を入力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function writeToMultipleSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ss.getSheetByName("Sheet1").getRange("A1").setValue("Sheet1のデータ");
  ss.getSheetByName("データ").getRange("A1").setValue("データシートのデータ");
}
```

</details>

---

## Week 3-2: スプレッドシート操作2

### 学習トピック
- 複数セルの取得と入力（2次元配列）
- シートの操作
- 行・列の追加
- 行・列の削除
- カスタム関数

### 動画
[スプレッドシート操作2（動画）](https://www.youtube.com/watch?v=o-kX-lelHXY)

### スライド
[スプレッドシート操作2（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-05.pdf)

### 課題

#### 課題5-1: 複数セルへの一括入力

A1〜C1に「名前」「年齢」「都市」、A2〜C2に自分のプロフィールデータを2次元配列を使って一括入力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function writeTableData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  const headers = [["名前", "年齢", "都市"]];
  const data = [["山田太郎", 25, "東京"]];

  sheet.getRange(1, 1, 1, 3).setValues(headers);
  sheet.getRange(2, 1, 1, 3).setValues(data);
}
```

</details>

---

#### 課題5-2: 行の追加と削除

スプレッドシートの2行目に新しい行を挿入し、その後3行目を削除するスクリプトを作成してください。各操作後にシートの状態をログで確認できるようA1の値を出力してください。

<details>
<summary>模範回答</summary>

```javascript
function insertAndDeleteRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // 2行目に行を挿入
  sheet.insertRowBefore(2);
  console.log("行挿入後のA1: " + sheet.getRange("A1").getValue());

  // 3行目を削除
  sheet.deleteRow(3);
  console.log("行削除後のA1: " + sheet.getRange("A1").getValue());
}
```

</details>

---

#### 課題5-3: シートの追加

アクティブなスプレッドシートに「バックアップ」という名前のシートを新規追加し、シート名の一覧をログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function addSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ss.insertSheet("バックアップ");

  const sheets = ss.getSheets();
  for (const sheet of sheets) {
    console.log(sheet.getName());
  }
}
```

</details>

---

## Week 3-3: データベース活用

### 学習トピック
- データベースとは
- データベース管理の4つの機能
- 最終行・最終列の取得
- データの加工
- 関数の分割と汎用化

### 動画
[データベース活用（動画）](https://www.youtube.com/watch?v=7bkNZbKlszY)

### スライド
[データベース活用（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-06.pdf)

### 課題

#### 課題6-1: 最終行の取得

A列に名前が入力されたリストを用意し、データが入力されている最終行番号をログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function getLastRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  console.log("最終行: " + lastRow);
}
```

</details>

---

#### 課題6-2: データの検索

A列に名前、B列に点数が入力されたリストから、点数が80点以上の行の名前をログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function findHighScorers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(1, 1, lastRow, 2).getValues();

  for (const row of data) {
    const name = row[0];
    const score = row[1];

    if (score >= 80) {
      console.log(name + ": " + score + "点");
    }
  }
}
```

</details>

---

#### 課題6-3: データの追加

既存のリストの最終行の次の行に、新しいデータ（名前・点数）を追加するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function appendData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  const newData = ["田中二郎", 92];
  sheet.getRange(lastRow + 1, 1, 1, 2).setValues([newData]);

  console.log((lastRow + 1) + "行目にデータを追加しました");
}
```

</details>

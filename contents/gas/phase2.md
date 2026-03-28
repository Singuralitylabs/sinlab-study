# Phase 2 - Googleドライブ

Googleドライブのファイル・フォルダ操作をGASで自動化します。

---

## Week 2-1: Googleドライブの操作

### 学習トピック
- Googleドライブとは
- フォルダの操作（取得・名前変更・移動・新規作成）
- ファイルの操作（取得・名前変更・移動・コピー・新規作成）

### 動画
[Googleドライブの操作（動画）](https://www.youtube.com/watch?v=yKeofE0xtK4)

### スライド
[Googleドライブの操作（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-03.pdf)

### 課題

#### 課題3-1: フォルダの作成

マイドライブ直下に「GAS練習」というフォルダを作成し、作成したフォルダのIDをログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function createFolder() {
  const folder = DriveApp.createFolder("GAS練習");
  console.log("フォルダID: " + folder.getId());
}
```

</details>

---

#### 課題3-2: ファイルの取得と名前変更

ドライブ上に存在する任意のファイルをIDで取得し、ファイル名を変更するスクリプトを作成してください。変更前と変更後のファイル名をログに出力してください。

<details>
<summary>模範回答</summary>

```javascript
function renameFile() {
  // 対象ファイルのIDを指定する
  const fileId = "ここにファイルIDを入力";
  const file = DriveApp.getFileById(fileId);

  console.log("変更前: " + file.getName());
  file.setName("新しいファイル名");
  console.log("変更後: " + file.getName());
}
```

</details>

---

#### 課題3-3: フォルダ内のファイル一覧

特定のフォルダ内にある全ファイルの名前をログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
function listFilesInFolder() {
  // 対象フォルダのIDを指定する
  const folderId = "ここにフォルダIDを入力";
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    console.log(file.getName());
  }
}
```

</details>

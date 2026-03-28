-- =====================================================
-- GAS講座 演習コンテンツの一括登録
-- submission.md の課題・模範回答を learning_contents に登録
-- content_type = 'exercise'、display_order は video=1, slide=2 の後に連番
-- =====================================================

-- ====================================================
-- Phase 1: 基礎文法の学習1
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題1-1: ログ出力と変数', 'exercise', $i$
自分の名前・年齢・職業を変数に格納し、以下の形式でログに出力するスクリプトを作成してください。

```
実行結果例:
名前: 山田太郎
年齢: 25
職業: エンジニア
```
$i$, $a$
function printProfile() {
  const name = "山田太郎";
  const age = 25;
  const job = "エンジニア";

  console.log("名前: " + name);
  console.log("年齢: " + age);
  console.log("職業: " + job);
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = '基礎文法の学習1'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題1-1: ログ出力と変数'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題1-2: 四則演算', 'exercise', $i$
2つの変数 `a = 10`、`b = 3` を使って、加算・減算・乗算・除算・余りの結果をそれぞれログに出力してください。
$i$, $a$
function calculate() {
  const a = 10;
  const b = 3;

  console.log("加算: " + (a + b));
  console.log("減算: " + (a - b));
  console.log("乗算: " + (a * b));
  console.log("除算: " + (a / b));
  console.log("余り: " + (a % b));
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = '基礎文法の学習1'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題1-2: 四則演算'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題1-3: 条件分岐', 'exercise', $i$
変数 `score` に点数（0〜100の整数）を入れ、以下のルールで評価をログに出力してください。

- 80点以上 → "合格"
- 60点以上80点未満 → "再試験"
- 60点未満 → "不合格"
$i$, $a$
function judgeScore() {
  const score = 75;

  if (score >= 80) {
    console.log("合格");
  } else if (score >= 60) {
    console.log("再試験");
  } else {
    console.log("不合格");
  }
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = '基礎文法の学習1'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題1-3: 条件分岐'
  );

-- ====================================================
-- Phase 1: 基礎文法の学習2
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題2-1: 配列と繰り返し', 'exercise', $i$
果物の名前を5つ配列に格納し、for~of文を使って全ての要素をログに出力してください。
$i$, $a$
function printFruits() {
  const fruits = ["りんご", "バナナ", "みかん", "ぶどう", "いちご"];

  for (const fruit of fruits) {
    console.log(fruit);
  }
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = '基礎文法の学習2'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題2-1: 配列と繰り返し'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題2-2: オブジェクト', 'exercise', $i$
社員情報（名前・部署・入社年）をオブジェクトで表し、各プロパティをログに出力してください。
$i$, $a$
function printEmployee() {
  const employee = {
    name: "鈴木花子",
    department: "営業部",
    joinYear: 2020,
  };

  console.log("名前: " + employee.name);
  console.log("部署: " + employee.department);
  console.log("入社年: " + employee.joinYear);
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = '基礎文法の学習2'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題2-2: オブジェクト'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題2-3: 関数', 'exercise', $i$
2つの数値を引数として受け取り、大きい方の値を返す関数 `getMax` を作成してください。作成後、`getMax(8, 15)` を呼び出して結果をログに出力してください。
$i$, $a$
function getMax(a, b) {
  if (a >= b) {
    return a;
  } else {
    return b;
  }
}

function main() {
  const result = getMax(8, 15);
  console.log("大きい方の値: " + result);
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = '基礎文法の学習2'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題2-3: 関数'
  );

-- ====================================================
-- Phase 2: Googleドライブの操作
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題3-1: フォルダの作成', 'exercise', $i$
マイドライブ直下に「GAS練習」というフォルダを作成し、作成したフォルダのIDをログに出力するスクリプトを作成してください。
$i$, $a$
function createFolder() {
  const folder = DriveApp.createFolder("GAS練習");
  console.log("フォルダID: " + folder.getId());
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'Googleドライブの操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題3-1: フォルダの作成'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題3-2: ファイルの取得と名前変更', 'exercise', $i$
ドライブ上に存在する任意のファイルをIDで取得し、ファイル名を変更するスクリプトを作成してください。変更前と変更後のファイル名をログに出力してください。
$i$, $a$
function renameFile() {
  // 対象ファイルのIDを指定する
  const fileId = "ここにファイルIDを入力";
  const file = DriveApp.getFileById(fileId);

  console.log("変更前: " + file.getName());
  file.setName("新しいファイル名");
  console.log("変更後: " + file.getName());
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'Googleドライブの操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題3-2: ファイルの取得と名前変更'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題3-3: フォルダ内のファイル一覧', 'exercise', $i$
特定のフォルダ内にある全ファイルの名前をログに出力するスクリプトを作成してください。
$i$, $a$
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
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'Googleドライブの操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題3-3: フォルダ内のファイル一覧'
  );

-- ====================================================
-- Phase 3: スプレッドシート操作1
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題4-1: セルへの値の入力', 'exercise', $i$
アクティブなスプレッドシートのA1セルに「こんにちは！」、B1セルに本日の日付をそれぞれ入力するスクリプトを作成してください。
$i$, $a$
function writeToCell() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  sheet.getRange("A1").setValue("こんにちは！");
  sheet.getRange("B1").setValue(new Date());
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'スプレッドシート操作1'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題4-1: セルへの値の入力'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題4-2: セルの値の取得', 'exercise', $i$
A1セルに任意の文字列を手動で入力しておき、スクリプトでその値を取得してログに出力してください。
$i$, $a$
function readFromCell() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const value = sheet.getRange("A1").getValue();

  console.log("A1の値: " + value);
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'スプレッドシート操作1'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題4-2: セルの値の取得'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題4-3: シートの指定', 'exercise', $i$
スプレッドシートに「Sheet1」と「データ」の2つのシートを作成し、それぞれのシートのA1セルに異なる値を入力するスクリプトを作成してください。
$i$, $a$
function writeToMultipleSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ss.getSheetByName("Sheet1").getRange("A1").setValue("Sheet1のデータ");
  ss.getSheetByName("データ").getRange("A1").setValue("データシートのデータ");
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'スプレッドシート操作1'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題4-3: シートの指定'
  );

-- ====================================================
-- Phase 3: スプレッドシート操作2
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題5-1: 複数セルへの一括入力', 'exercise', $i$
A1〜C1に「名前」「年齢」「都市」、A2〜C2に自分のプロフィールデータを2次元配列を使って一括入力するスクリプトを作成してください。
$i$, $a$
function writeTableData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  const headers = [["名前", "年齢", "都市"]];
  const data = [["山田太郎", 25, "東京"]];

  sheet.getRange(1, 1, 1, 3).setValues(headers);
  sheet.getRange(2, 1, 1, 3).setValues(data);
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'スプレッドシート操作2'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題5-1: 複数セルへの一括入力'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題5-2: 行の追加と削除', 'exercise', $i$
スプレッドシートの2行目に新しい行を挿入し、その後3行目を削除するスクリプトを作成してください。各操作後にシートの状態をログで確認できるようA1の値を出力してください。
$i$, $a$
function insertAndDeleteRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // 2行目に行を挿入
  sheet.insertRowBefore(2);
  console.log("行挿入後のA1: " + sheet.getRange("A1").getValue());

  // 3行目を削除
  sheet.deleteRow(3);
  console.log("行削除後のA1: " + sheet.getRange("A1").getValue());
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'スプレッドシート操作2'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題5-2: 行の追加と削除'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題5-3: シートの追加', 'exercise', $i$
アクティブなスプレッドシートに「バックアップ」という名前のシートを新規追加し、シート名の一覧をログに出力するスクリプトを作成してください。
$i$, $a$
function addSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ss.insertSheet("バックアップ");

  const sheets = ss.getSheets();
  for (const sheet of sheets) {
    console.log(sheet.getName());
  }
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'スプレッドシート操作2'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題5-3: シートの追加'
  );

-- ====================================================
-- Phase 3: データベース活用
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題6-1: 最終行の取得', 'exercise', $i$
A列に名前が入力されたリストを用意し、データが入力されている最終行番号をログに出力するスクリプトを作成してください。
$i$, $a$
function getLastRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  console.log("最終行: " + lastRow);
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'データベース活用'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題6-1: 最終行の取得'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題6-2: データの検索', 'exercise', $i$
A列に名前、B列に点数が入力されたリストから、点数が80点以上の行の名前をログに出力するスクリプトを作成してください。
$i$, $a$
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
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'データベース活用'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題6-2: データの検索'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題6-3: データの追加', 'exercise', $i$
既存のリストの最終行の次の行に、新しいデータ（名前・点数）を追加するスクリプトを作成してください。
$i$, $a$
function appendData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  const newData = ["田中二郎", 92];
  sheet.getRange(lastRow + 1, 1, 1, 2).setValues([newData]);

  console.log((lastRow + 1) + "行目にデータを追加しました");
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'データベース活用'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題6-3: データの追加'
  );

-- ====================================================
-- Phase 4: Gmailの送信
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題7-1: メールの送信', 'exercise', $i$
自分のメールアドレス宛に件名「GASテストメール」、本文「GASからメールを送信しました。」というメールを送信するスクリプトを作成してください。
$i$, $a$
function sendTestMail() {
  const to = "your-email@example.com"; // 自分のメールアドレスに変更
  const subject = "GASテストメール";
  const body = "GASからメールを送信しました。";

  GmailApp.sendEmail(to, subject, body);
  console.log("メールを送信しました");
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'Gmailの送信'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題7-1: メールの送信'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題7-2: 複数行の本文でメール送信', 'exercise', $i$
以下の情報を含む本文のメールを送信するスクリプトを作成してください。

```
件名: 【テスト】お知らせ
本文:
お世話になっております。

テスト送信です。
以上、よろしくお願いいたします。
```
$i$, $a$
function sendFormattedMail() {
  const to = "your-email@example.com"; // 自分のメールアドレスに変更
  const subject = "【テスト】お知らせ";
  const body = "お世話になっております。\n\nテスト送信です。\n以上、よろしくお願いいたします。";

  GmailApp.sendEmail(to, subject, body);
  console.log("メールを送信しました");
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'Gmailの送信'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題7-2: 複数行の本文でメール送信'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題7-3: スプレッドシートからの一括送信', 'exercise', $i$
スプレッドシートのA列に名前、B列にメールアドレスが入力されたリストを作成し、各人に「〇〇さん、こんにちは！」という内容のメールを一括送信するスクリプトを作成してください。
$i$, $a$
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
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'Gmailの送信'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題7-3: スプレッドシートからの一括送信'
  );

-- ====================================================
-- Phase 5: Googleフォーム
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題8-1: フォームの作成', 'exercise', $i$
「アンケート」というタイトルのGoogleフォームをGASで作成し、フォームのURLをログに出力するスクリプトを作成してください。
$i$, $a$
function createForm() {
  const form = FormApp.create("アンケート");

  console.log("フォームURL: " + form.getPublishedUrl());
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'Googleフォーム'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題8-1: フォームの作成'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題8-2: 設問の追加', 'exercise', $i$
「アンケート」フォームに以下の2つの設問を追加するスクリプトを作成してください。

1. テキスト設問「お名前を入力してください」（必須）
2. 段落設問「ご意見・ご感想をお聞かせください」
$i$, $a$
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
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'Googleフォーム'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題8-2: 設問の追加'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題8-3: フォームのタイトルと説明文の変更', 'exercise', $i$
既存のフォームのIDを指定し、タイトルを「満足度調査」、説明文を「サービスに関するアンケートです。ご協力をお願いします。」に変更するスクリプトを作成してください。
$i$, $a$
function updateFormInfo() {
  const formId = "ここにフォームIDを入力";
  const form = FormApp.openById(formId);

  form.setTitle("満足度調査");
  form.setDescription("サービスに関するアンケートです。ご協力をお願いします。");

  console.log("タイトル: " + form.getTitle());
  console.log("説明: " + form.getDescription());
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'Googleフォーム'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題8-3: フォームのタイトルと説明文の変更'
  );

-- ====================================================
-- Phase 5: Googleフォームの活用
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題9-1: フォーム送信トリガーの設定', 'exercise', $i$
フォームが送信されたときに実行される関数 `onFormSubmit` を作成し、「フォームが送信されました」とログに出力するスクリプトと、そのトリガーを登録するスクリプトを作成してください。
$i$, $a$
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
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'Googleフォームの活用'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題9-1: フォーム送信トリガーの設定'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題9-2: 回答内容の取得', 'exercise', $i$
フォーム送信時に、回答者の各設問への回答をログに出力するスクリプトを作成してください。
$i$, $a$
function onFormSubmit(e) {
  const responses = e.response.getItemResponses();

  for (const response of responses) {
    const question = response.getItem().getTitle();
    const answer = response.getResponse();

    console.log(question + ": " + answer);
  }
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'Googleフォームの活用'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題9-2: 回答内容の取得'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題9-3: 回答をスプレッドシートに保存', 'exercise', $i$
フォーム送信時に、送信日時・回答内容をスプレッドシートの最終行に追加するスクリプトを作成してください。
$i$, $a$
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
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'Googleフォームの活用'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題9-3: 回答をスプレッドシートに保存'
  );

-- ====================================================
-- Phase 6: Googleカレンダー操作
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題10-1: イベントの作成', 'exercise', $i$
自分のGoogleカレンダーに「GAS勉強会」というイベントを明日の10:00〜11:00で作成するスクリプトを作成してください。
$i$, $a$
function createEvent() {
  const calendar = CalendarApp.getDefaultCalendar();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const startTime = new Date(tomorrow);
  startTime.setHours(10, 0, 0, 0);

  const endTime = new Date(tomorrow);
  endTime.setHours(11, 0, 0, 0);

  const event = calendar.createEvent("GAS勉強会", startTime, endTime);
  console.log("イベントを作成しました: " + event.getId());
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'Googleカレンダー操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題10-1: イベントの作成'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題10-2: イベントの取得', 'exercise', $i$
今日のカレンダーイベントを全て取得し、イベント名と開始時刻をログに出力するスクリプトを作成してください。
$i$, $a$
function getTodayEvents() {
  const calendar = CalendarApp.getDefaultCalendar();

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const events = calendar.getEvents(startOfDay, endOfDay);

  if (events.length === 0) {
    console.log("今日のイベントはありません");
  } else {
    for (const event of events) {
      console.log(event.getTitle() + " - " + event.getStartTime());
    }
  }
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'Googleカレンダー操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題10-2: イベントの取得'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題10-3: イベントの削除', 'exercise', $i$
タイトルに「テスト」を含むイベントを今後1週間の範囲で検索し、全て削除するスクリプトを作成してください。
$i$, $a$
function deleteTestEvents() {
  const calendar = CalendarApp.getDefaultCalendar();

  const now = new Date();
  const oneWeekLater = new Date();
  oneWeekLater.setDate(now.getDate() + 7);

  const events = calendar.getEvents(now, oneWeekLater);
  let count = 0;

  for (const event of events) {
    if (event.getTitle().includes("テスト")) {
      event.deleteEvent();
      count++;
    }
  }

  console.log(count + "件のイベントを削除しました");
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'Googleカレンダー操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題10-3: イベントの削除'
  );

-- ====================================================
-- Phase 6: フォームによるカレンダー操作
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題11-1: try-catchによるエラーハンドリング', 'exercise', $i$
存在しないカレンダーIDを指定した際にエラーが発生します。try-catchを使ってエラーをキャッチし、「カレンダーが見つかりませんでした」とログに出力するスクリプトを作成してください。
$i$, $a$
function getCalendarSafely() {
  const calendarId = "存在しないID@group.calendar.google.com";

  try {
    const calendar = CalendarApp.getCalendarById(calendarId);
    console.log("カレンダー名: " + calendar.getName());
  } catch (e) {
    console.log("カレンダーが見つかりませんでした");
    console.log("エラー内容: " + e.message);
  }
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'フォームによるカレンダー操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題11-1: try-catchによるエラーハンドリング'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題11-2: 入力値のバリデーション', 'exercise', $i$
フォームから受け取った開始時刻と終了時刻を使ってイベントを作成する関数を作成してください。ただし、終了時刻が開始時刻より前の場合は「時刻の設定が不正です」とログに出力して処理を中断してください。
$i$, $a$
function createEventWithValidation(title, startTime, endTime) {
  if (endTime <= startTime) {
    console.log("時刻の設定が不正です");
    return;
  }

  const calendar = CalendarApp.getDefaultCalendar();
  calendar.createEvent(title, startTime, endTime);
  console.log("イベントを作成しました: " + title);
}

function main() {
  const start = new Date("2026-04-01T10:00:00");
  const end = new Date("2026-04-01T11:00:00");

  createEventWithValidation("ミーティング", start, end);
}
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'フォームによるカレンダー操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題11-2: 入力値のバリデーション'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題11-3: フォームからカレンダーにイベント登録', 'exercise', $i$
フォームにイベント名・日付・開始時間・終了時間の設問を作成し、回答をもとにGoogleカレンダーへイベントを自動登録するスクリプトを作成してください。
$i$, $a$
function onFormSubmit(e) {
  try {
    const responses = e.response.getItemResponses();
    const title = responses[0].getResponse();
    const dateStr = responses[1].getResponse();
    const startHour = parseInt(responses[2].getResponse());
    const endHour = parseInt(responses[3].getResponse());

    const date = new Date(dateStr);
    const startTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour, 0, 0);
    const endTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endHour, 0, 0);

    if (endTime <= startTime) {
      console.log("時刻の設定が不正です");
      return;
    }

    const calendar = CalendarApp.getDefaultCalendar();
    calendar.createEvent(title, startTime, endTime);
    console.log("イベントを登録しました: " + title);
  } catch (e) {
    console.log("エラーが発生しました: " + e.message);
  }
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'フォームによるカレンダー操作'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題11-3: フォームからカレンダーにイベント登録'
  );

-- ====================================================
-- Phase 7: GASの便利な機能
-- ====================================================

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題12-1: プロパティストアへのデータ保存', 'exercise', $i$
スクリプトプロパティに「API_KEY」というキーで任意の文字列を保存し、その後取得してログに出力するスクリプトを作成してください。
$i$, $a$
function saveAndGetProperty() {
  const properties = PropertiesService.getScriptProperties();

  // 保存
  properties.setProperty("API_KEY", "my-secret-api-key-12345");
  console.log("プロパティを保存しました");

  // 取得
  const apiKey = properties.getProperty("API_KEY");
  console.log("API_KEY: " + apiKey);
}
$a$, 3, true
FROM learning_weeks w
WHERE w.name = 'GASの便利な機能'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題12-1: プロパティストアへのデータ保存'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題12-2: ダイアログの表示', 'exercise', $i$
スプレッドシートのメニューから実行できる関数を作成し、「処理を実行しますか？」という確認ダイアログを表示してください。「OK」を押した場合は「実行しました」、「キャンセル」を押した場合は「キャンセルしました」とダイアログで表示してください。
$i$, $a$
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
$a$, 4, true
FROM learning_weeks w
WHERE w.name = 'GASの便利な機能'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題12-2: ダイアログの表示'
  );

INSERT INTO learning_contents (week_id, title, content_type, exercise_instructions, reference_answer, display_order, is_published)
SELECT w.id, '課題12-3: カスタムメニューの追加', 'exercise', $i$
スプレッドシートを開いたときに「GASツール」というカスタムメニューを追加し、その中に「データ集計」という項目を作成してください。「データ集計」をクリックすると「集計を実行します」とログに出力されるようにしてください。
$i$, $a$
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("GASツール")
    .addItem("データ集計", "aggregateData")
    .addToUi();
}

function aggregateData() {
  console.log("集計を実行します");
}
$a$, 5, true
FROM learning_weeks w
WHERE w.name = 'GASの便利な機能'
  AND NOT EXISTS (
    SELECT 1 FROM learning_contents WHERE week_id = w.id AND title = '課題12-3: カスタムメニューの追加'
  );

-- GAS講座 全演習課題へのヒントデータ投入
-- learning_weeks.name と learning_contents.title でコンテンツを特定してヒントを設定する

-- Week 1-1: 基礎文法の学習1

UPDATE learning_contents SET hint = $hint$
- `const` キーワードで変数を宣言します（例: `const name = "山田太郎"`）
- `console.log()` でログ出力できます
- 文字列と変数を連結するには `+` 演算子を使います（例: `"名前: " + name`）
$hint$
WHERE title = '課題1-1: ログ出力と変数'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = '基礎文法の学習1');

UPDATE learning_contents SET hint = $hint$
- 加算は `+`、減算は `-`、乗算は `*`、除算は `/`、余りは `%` を使います
- 計算結果と文字列を同時に出力するとき、`(a + b)` のように括弧で囲むと意図した順序で計算されます
$hint$
WHERE title = '課題1-2: 四則演算'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = '基礎文法の学習1');

UPDATE learning_contents SET hint = $hint$
- `if (条件) { } else if (条件) { } else { }` の構文を使います
- 「以上」は `>=`、「未満」は `<` で表現します
- 条件は上から順に評価されるため、点数の高い条件から書くとシンプルになります
$hint$
WHERE title = '課題1-3: 条件分岐'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = '基礎文法の学習1');

-- Week 1-2: 基礎文法の学習2

UPDATE learning_contents SET hint = $hint$
- 配列は `const fruits = ["りんご", "バナナ"]` のように `[]` で作成します
- `for (const item of 配列)` で各要素を順番に取り出せます
$hint$
WHERE title = '課題2-1: 配列と繰り返し'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = '基礎文法の学習2');

UPDATE learning_contents SET hint = $hint$
- オブジェクトは `const obj = { key: value }` の形で作成します
- プロパティへのアクセスは `obj.プロパティ名` です（例: `employee.name`）
$hint$
WHERE title = '課題2-2: オブジェクト'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = '基礎文法の学習2');

UPDATE learning_contents SET hint = $hint$
- `function 関数名(引数1, 引数2) { return 値; }` の形で関数を定義します
- 大きい方を返すには `if` 文で2つの値を比較します
- 関数を呼び出した結果を変数に代入できます（例: `const result = getMax(8, 15)`）
$hint$
WHERE title = '課題2-3: 関数'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = '基礎文法の学習2');

-- Week 2-1: Googleドライブの操作

UPDATE learning_contents SET hint = $hint$
- `DriveApp.createFolder("フォルダ名")` でマイドライブ直下にフォルダを作成できます
- 作成したフォルダオブジェクトの `.getId()` でIDを取得できます
$hint$
WHERE title = '課題3-1: フォルダの作成'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleドライブの操作');

UPDATE learning_contents SET hint = $hint$
- ファイルIDはGoogle DriveのファイルURLに含まれています（`/d/xxxxxx/` の部分）
- `DriveApp.getFileById(id)` でファイルオブジェクトを取得します
- `.getName()` で現在のファイル名を取得し、`.setName("新しい名前")` で変更できます
$hint$
WHERE title = '課題3-2: ファイルの取得と名前変更'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleドライブの操作');

UPDATE learning_contents SET hint = $hint$
- `DriveApp.getFolderById(id)` でフォルダを取得し、`.getFiles()` でファイルの**イテレータ**を取得します
- イテレータは配列ではないため `while (files.hasNext())` でループします
- `files.next()` で次のファイルオブジェクトを取得し、`.getName()` でファイル名を取得できます
$hint$
WHERE title = '課題3-3: フォルダ内のファイル一覧'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleドライブの操作');

-- Week 3-1: スプレッドシート操作1

UPDATE learning_contents SET hint = $hint$
- `SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()` でアクティブなシートを取得します
- `sheet.getRange("A1").setValue(値)` でセルに値を入力します
- 現在の日付は `new Date()` で取得できます
$hint$
WHERE title = '課題4-1: セルへの値の入力'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'スプレッドシート操作1');

UPDATE learning_contents SET hint = $hint$
- `sheet.getRange("A1").getValue()` でセルの値を取得できます
- `setValue()` で入力、`getValue()` で取得と対になっています
$hint$
WHERE title = '課題4-2: セルの値の取得'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'スプレッドシート操作1');

UPDATE learning_contents SET hint = $hint$
- `SpreadsheetApp.getActiveSpreadsheet()` でスプレッドシートを取得し、`getSheetByName("シート名")` で名前でシートを指定します
- スクリプト実行前に、スプレッドシート上に「Sheet1」と「データ」の2つのシートを手動で作成しておいてください
$hint$
WHERE title = '課題4-3: シートの指定'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'スプレッドシート操作1');

-- Week 3-2: スプレッドシート操作2

UPDATE learning_contents SET hint = $hint$
- `sheet.getRange(行, 列, 行数, 列数).setValues(2次元配列)` で複数セルに一括入力できます
- `setValues()` は `[[値1, 値2, 値3]]` のような**2次元配列**を引数に渡します
- `getRange(1, 1, 1, 3)` は「1行目・1列目から1行・3列分」を意味します
$hint$
WHERE title = '課題5-1: 複数セルへの一括入力'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'スプレッドシート操作2');

UPDATE learning_contents SET hint = $hint$
- `sheet.insertRowBefore(2)` で2行目の前に新しい行を挿入します
- `sheet.deleteRow(3)` で3行目を削除します（行番号は1始まりです）
- 操作の前後でA1の値をログに出力して変化を確認しましょう
$hint$
WHERE title = '課題5-2: 行の追加と削除'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'スプレッドシート操作2');

UPDATE learning_contents SET hint = $hint$
- `ss.insertSheet("シート名")` で新しいシートを追加します
- `ss.getSheets()` は全シートの**配列**を返します（イテレータではありません）
- `for...of` で配列をループし、`.getName()` でシート名を取得できます
$hint$
WHERE title = '課題5-3: シートの追加'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'スプレッドシート操作2');

-- Week 3-3: データベース活用

UPDATE learning_contents SET hint = $hint$
- `sheet.getLastRow()` はA列に限らず、シート内でデータが入力されている最終行番号を返します
- データが1件もない場合は `0` を返します
$hint$
WHERE title = '課題6-1: 最終行の取得'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'データベース活用');

UPDATE learning_contents SET hint = $hint$
- `sheet.getRange(1, 1, lastRow, 2).getValues()` で全データを2次元配列として取得します
- `data[i][0]` がA列（名前）、`data[i][1]` がB列（点数）の値です
- `for...of` でループし、点数が80以上の行だけ出力します
$hint$
WHERE title = '課題6-2: データの検索'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'データベース活用');

UPDATE learning_contents SET hint = $hint$
- `sheet.getLastRow()` で現在の最終行番号を取得し、`lastRow + 1` が追加先の行番号です
- `sheet.getRange(lastRow + 1, 1, 1, 2).setValues([[値1, 値2]])` で2列分のデータを追加できます
$hint$
WHERE title = '課題6-3: データの追加'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'データベース活用');

-- Week 4-1: Gmailの送信

UPDATE learning_contents SET hint = $hint$
- `GmailApp.sendEmail(宛先メールアドレス, 件名, 本文)` でメールを送信します
- 初回実行時にGmailへのアクセス許可を求めるダイアログが表示されます
$hint$
WHERE title = '課題7-1: メールの送信'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Gmailの送信');

UPDATE learning_contents SET hint = $hint$
- 本文の改行は `\n` で表現します
- 空行（1行空ける）は `\n\n` です
- 文字列を複数行に分けて書くには `+` で連結するか、バッククォート `` ` `` を使ったテンプレートリテラルが便利です
$hint$
WHERE title = '課題7-2: 複数行の本文でメール送信'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Gmailの送信');

UPDATE learning_contents SET hint = $hint$
- `sheet.getRange(1, 1, lastRow, 2).getValues()` でA〜B列の全データを取得します
- `for (const row of data)` でループし、`row[0]` が名前、`row[1]` がメールアドレスです
- `name + "さん、こんにちは！"` のように変数を使って本文を動的に生成します
$hint$
WHERE title = '課題7-3: スプレッドシートからの一括送信'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Gmailの送信');

-- Week 5-1: Googleフォーム

UPDATE learning_contents SET hint = $hint$
- `FormApp.create("タイトル")` で新しいフォームを作成します
- 作成したフォームオブジェクトの `.getPublishedUrl()` で公開用URLを取得できます
$hint$
WHERE title = '課題8-1: フォームの作成'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleフォーム');

UPDATE learning_contents SET hint = $hint$
- `form.addTextItem()` で1行テキスト設問を追加します
- `form.addParagraphTextItem()` で複数行テキスト設問（段落）を追加します
- メソッドチェーンで `.setTitle("設問文").setRequired(true)` のように設定できます
$hint$
WHERE title = '課題8-2: 設問の追加'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleフォーム');

UPDATE learning_contents SET hint = $hint$
- フォームIDはフォーム編集画面のURL（`/d/xxxxxx/edit` の部分）から確認できます
- `FormApp.openById(id)` で既存フォームを開きます
- `.setTitle("新タイトル")` でタイトル、`.setDescription("説明文")` で説明文を変更します
$hint$
WHERE title = '課題8-3: フォームのタイトルと説明文の変更'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleフォーム');

-- Week 5-2: Googleフォームの活用

UPDATE learning_contents SET hint = $hint$
- トリガー登録用の関数（`createFormTrigger`）とトリガーで実行される関数（`onFormSubmit`）は別々に作成します
- `ScriptApp.newTrigger("関数名").forForm(form).onFormSubmit().create()` でフォーム送信トリガーを登録します
- トリガー登録関数は**一度だけ手動で実行**します（毎回実行すると重複登録されます）
$hint$
WHERE title = '課題9-1: フォーム送信トリガーの設定'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleフォームの活用');

UPDATE learning_contents SET hint = $hint$
- `e.response.getItemResponses()` でフォーム回答の配列を取得します
- 各要素から `.getItem().getTitle()` で設問のタイトルを、`.getResponse()` で回答内容を取得できます
- `for...of` でループして全設問の回答を処理します
$hint$
WHERE title = '課題9-2: 回答内容の取得'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleフォームの活用');

UPDATE learning_contents SET hint = $hint$
- `sheet.appendRow(配列)` で配列の内容を末尾の行に追加できます
- タイムスタンプは `new Date()` で取得します
- `e.response.getItemResponses()` の回答を `for...of` でループして配列に追加していきます
$hint$
WHERE title = '課題9-3: 回答をスプレッドシートに保存'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleフォームの活用');

-- Week 6-1: Googleカレンダー操作

UPDATE learning_contents SET hint = $hint$
- `CalendarApp.getDefaultCalendar()` でデフォルトのカレンダーを取得します
- `calendar.createEvent(タイトル, 開始日時, 終了日時)` でイベントを作成します
- 日時は `new Date()` で取得し、`.setDate(date.getDate() + 1)` で翌日、`.setHours(10, 0, 0, 0)` で時刻を指定できます
$hint$
WHERE title = '課題10-1: イベントの作成'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleカレンダー操作');

UPDATE learning_contents SET hint = $hint$
- `calendar.getEvents(開始日時, 終了日時)` で期間内のイベント**配列**を返します
- 今日の開始は `new Date(year, month, date, 0, 0, 0)` で時刻を0時0分0秒に設定します
- `events.length === 0` でイベントが0件かどうか確認できます
$hint$
WHERE title = '課題10-2: イベントの取得'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleカレンダー操作');

UPDATE learning_contents SET hint = $hint$
- `event.getTitle().includes("テスト")` でタイトルに「テスト」が含まれるか確認できます
- `event.deleteEvent()` でイベントを削除します
- 削除した件数をカウントする変数を用意しておくとログ出力に便利です
$hint$
WHERE title = '課題10-3: イベントの削除'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'Googleカレンダー操作');

-- Week 6-2: フォームによるカレンダー操作

UPDATE learning_contents SET hint = $hint$
- `try { 試みる処理 } catch (e) { エラー時の処理 }` の構文を使います
- 存在しないカレンダーIDを使うと `CalendarApp.getCalendarById()` の後続処理でエラーが発生します
- キャッチしたエラーオブジェクトの `.message` プロパティでエラーメッセージを取得できます
$hint$
WHERE title = '課題11-1: try-catchによるエラーハンドリング'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'フォームによるカレンダー操作');

UPDATE learning_contents SET hint = $hint$
- `Date` オブジェクト同士は `<=` や `>=` で大小比較できます
- 条件を満たさない場合に処理を中断するには `return` を使います
- `createEventWithValidation` と呼び出す `main` 関数の2つを作成します
$hint$
WHERE title = '課題11-2: 入力値のバリデーション'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'フォームによるカレンダー操作');

UPDATE learning_contents SET hint = $hint$
- フォーム回答は `e.response.getItemResponses()` で取得し、インデックスで各設問の回答を参照します（`responses[0]` が1問目）
- 日付文字列は `new Date(dateStr)` でDateオブジェクトに変換できます
- try-catchでエラーハンドリングを組み込んでおくと安全です
$hint$
WHERE title = '課題11-3: フォームからカレンダーにイベント登録'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'フォームによるカレンダー操作');

-- Week 7-1: GASの便利な機能

UPDATE learning_contents SET hint = $hint$
- `PropertiesService.getScriptProperties()` でスクリプトプロパティオブジェクトを取得します
- `.setProperty("キー", "値")` で保存し、`.getProperty("キー")` で取得します
- プロパティに保存した値はスクリプトを再実行しても保持されます
$hint$
WHERE title = '課題12-1: プロパティストアへのデータ保存'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'GASの便利な機能');

UPDATE learning_contents SET hint = $hint$
- `SpreadsheetApp.getUi()` でUIオブジェクトを取得します
- `ui.alert(タイトル, メッセージ, ui.ButtonSet.OK_CANCEL)` で「OK/キャンセル」ボタン付きダイアログを表示します
- 戻り値を `ui.Button.OK` と比較してどのボタンが押されたか判定します
- ダイアログはスプレッドシートを開いた状態でしか実行できません
$hint$
WHERE title = '課題12-2: ダイアログの表示'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'GASの便利な機能');

UPDATE learning_contents SET hint = $hint$
- `onOpen()` 関数はスプレッドシートを開いたときに**自動実行**されます
- `ui.createMenu("メニュー名").addItem("項目名", "実行する関数名").addToUi()` でメニューを追加します
- `addItem` の第2引数は文字列で関数名を指定します（関数を直接渡すのではありません）
$hint$
WHERE title = '課題12-3: カスタムメニューの追加'
  AND week_id = (SELECT id FROM learning_weeks WHERE name = 'GASの便利な機能');

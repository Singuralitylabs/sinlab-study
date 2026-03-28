# Phase 6 - Googleカレンダー

Googleカレンダーのイベント操作とエラーハンドリングを学びます。

---

## Week 6-1: Googleカレンダー操作

### 学習トピック
- Googleカレンダーとは
- GoogleカレンダーをGASで扱うメリット
- Dateオブジェクト
- カレンダーへのアクセス
- カレンダーイベントの取得・追加・更新・削除

### 動画
[Googleカレンダー操作（動画）](https://www.youtube.com/watch?v=FOJMKV7l7n4)

### スライド
[Googleカレンダー操作（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-10.pdf)

### 課題

#### 課題10-1: イベントの作成

自分のGoogleカレンダーに「GAS勉強会」というイベントを明日の10:00〜11:00で作成するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

---

#### 課題10-2: イベントの取得

今日のカレンダーイベントを全て取得し、イベント名と開始時刻をログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

---

#### 課題10-3: イベントの削除

タイトルに「テスト」を含むイベントを今後1週間の範囲で検索し、全て削除するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

---

## Week 6-2: フォームによるカレンダー操作

### 学習トピック
- エラーハンドリング（例外処理）
- 条件分岐による例外処理
- try~catchによる例外処理
- Googleフォームによる予約サービスを作ってみよう

### 動画
[フォームによるカレンダー操作（動画）](https://www.youtube.com/watch?v=2Fusjw7Ax0I)

### スライド
[フォームによるカレンダー操作（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-11.pdf)

### 課題

#### 課題11-1: try-catchによるエラーハンドリング

存在しないカレンダーIDを指定した際にエラーが発生します。try-catchを使ってエラーをキャッチし、「カレンダーが見つかりませんでした」とログに出力するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

---

#### 課題11-2: 入力値のバリデーション

フォームから受け取った開始時刻と終了時刻を使ってイベントを作成する関数を作成してください。ただし、終了時刻が開始時刻より前の場合は「時刻の設定が不正です」とログに出力して処理を中断してください。

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

---

#### 課題11-3: フォームからカレンダーにイベント登録

フォームにイベント名・日付・開始時間・終了時間の設問を作成し、回答をもとにGoogleカレンダーへイベントを自動登録するスクリプトを作成してください。

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

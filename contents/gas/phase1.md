# Phase 1 - 基礎文法

JavaScriptの基礎文法を学びます。

---

## Week 1-1: 基礎文法の学習1

### 学習トピック
- 基本的な書き方
- ログ出力
- コメント機能
- 変数
- 四則演算
- 条件分岐（if文・switch文）

### 動画
[基礎文法の学習1（動画）](https://www.youtube.com/watch?v=VkvRU334DYI)

### スライド
[基礎文法の学習1（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-01.pdf)

### 課題

#### 課題1-1: ログ出力と変数

自分の名前・年齢・職業を変数に格納し、以下の形式でログに出力するスクリプトを作成してください。

```
実行結果例:
名前: 山田太郎
年齢: 25
職業: エンジニア
```

<details>
<summary>ヒント</summary>

- `const` キーワードで変数を宣言します（例: `const name = "山田太郎"`）
- `console.log()` でログ出力できます
- 文字列と変数を連結するには `+` 演算子を使います（例: `"名前: " + name`）

</details>

<details>
<summary>模範回答</summary>

```javascript
function printProfile() {
  const name = "山田太郎";
  const age = 25;
  const job = "エンジニア";

  console.log("名前: " + name);
  console.log("年齢: " + age);
  console.log("職業: " + job);
}
```

</details>

---

#### 課題1-2: 四則演算

2つの変数 `a = 10`、`b = 3` を使って、加算・減算・乗算・除算・余りの結果をそれぞれログに出力してください。

<details>
<summary>ヒント</summary>

- 加算は `+`、減算は `-`、乗算は `*`、除算は `/`、余りは `%` を使います
- 計算結果と文字列を同時に出力するとき、`(a + b)` のように括弧で囲むと意図した順序で計算されます

</details>

<details>
<summary>模範回答</summary>

```javascript
function calculate() {
  const a = 10;
  const b = 3;

  console.log("加算: " + (a + b));
  console.log("減算: " + (a - b));
  console.log("乗算: " + (a * b));
  console.log("除算: " + (a / b));
  console.log("余り: " + (a % b));
}
```

</details>

---

#### 課題1-3: 条件分岐

変数 `score` に点数（0〜100の整数）を入れ、以下のルールで評価をログに出力してください。

- 80点以上 → "合格"
- 60点以上80点未満 → "再試験"
- 60点未満 → "不合格"

<details>
<summary>ヒント</summary>

- `if (条件) { } else if (条件) { } else { }` の構文を使います
- 「以上」は `>=`、「未満」は `<` で表現します
- 条件は上から順に評価されるため、点数の高い条件から書くとシンプルになります

</details>

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

---

## Week 1-2: 基礎文法の学習2

### 学習トピック
- 配列
- オブジェクト
- 繰り返し文（for文・while文）
- 関数

### 動画
[基礎文法の学習2（動画）](https://www.youtube.com/watch?v=TCzYJ3Fxbl0)

### スライド
[基礎文法の学習2（スライド）](https://rityzrpwpwcbgvvtsfsg.supabase.co/storage/v1/object/public/slides/gas/slide-02.pdf)

### 課題

#### 課題2-1: 配列と繰り返し

果物の名前を5つ配列に格納し、for~of文を使って全ての要素をログに出力してください。

<details>
<summary>ヒント</summary>

- 配列は `const fruits = ["りんご", "バナナ"]` のように `[]` で作成します
- `for (const item of 配列)` で各要素を順番に取り出せます

</details>

<details>
<summary>模範回答</summary>

```javascript
function printFruits() {
  const fruits = ["りんご", "バナナ", "みかん", "ぶどう", "いちご"];

  for (const fruit of fruits) {
    console.log(fruit);
  }
}
```

</details>

---

#### 課題2-2: オブジェクト

社員情報（名前・部署・入社年）をオブジェクトで表し、各プロパティをログに出力してください。

<details>
<summary>ヒント</summary>

- オブジェクトは `const obj = { key: value }` の形で作成します
- プロパティへのアクセスは `obj.プロパティ名` です（例: `employee.name`）

</details>

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

---

#### 課題2-3: 関数

2つの数値を引数として受け取り、大きい方の値を返す関数 `getMax` を作成してください。作成後、`getMax(8, 15)` を呼び出して結果をログに出力してください。

<details>
<summary>ヒント</summary>

- `function 関数名(引数1, 引数2) { return 値; }` の形で関数を定義します
- 大きい方を返すには `if` 文で2つの値を比較します
- 関数を呼び出した結果を変数に代入できます（例: `const result = getMax(8, 15)`）

</details>

<details>
<summary>模範回答</summary>

```javascript
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
```

</details>

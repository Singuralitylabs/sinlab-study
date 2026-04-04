# データベース設計書

本書は、Web技術学習支援サービスのデータベース設計について記載する。

---

## 1. 概要

### 1.1 データベース基盤
- **DBMS**: PostgreSQL（Supabase マネージドサービス）
- **認証**: Supabase Auth（`auth.uid()` による認証ユーザー識別）
- **アクセス制御**: Row Level Security（RLS）
- **タイムゾーン**: TIMESTAMPTZ（タイムゾーン付きタイムスタンプ）

### 1.2 設計方針
- 論理削除方式（`is_deleted` フラグ）によるデータ保全
- 公開制御（`is_published` フラグ）によるコンテンツ管理
- `display_order` によるユーザー任意の表示順制御
- `updated_at` の自動更新トリガーによるデータ整合性の確保
- 外部キー制約 + `ON DELETE CASCADE` によるデータ一貫性の保証

---

## 2. ER図

```mermaid
erDiagram
    learning_themes ||--o{ learning_phases : "1:N"
    learning_phases ||--o{ learning_weeks : "1:N"
    learning_weeks ||--o{ learning_contents : "1:N"
    learning_contents ||--o{ user_progress : "1:N"
    learning_contents ||--o{ submissions : "1:N"
    users ||--o{ user_progress : "1:N"
    users ||--o{ submissions : "1:N"
    submissions ||--o| ai_reviews : "1:1"

    learning_themes {
        serial id PK
        varchar name
        text description
        text image_url
        int display_order
        bool is_published
        bool is_deleted
    }
    learning_phases {
        serial id PK
        int theme_id FK
        varchar name
        text description
        int display_order
        bool is_published
        bool is_deleted
    }
    learning_weeks {
        serial id PK
        int phase_id FK
        varchar name
        text description
        int display_order
        bool is_published
        bool is_deleted
    }
    learning_contents {
        serial id PK
        int week_id FK
        varchar title
        varchar content_type
        text video_url
        text text_content
        text exercise_instructions
        text reference_answer
        text hint
        text pdf_url
        varchar allowed_submission_types
        varchar code_language
        int display_order
        bool is_published
        bool is_deleted
    }
    users {
        serial id PK
        uuid auth_id
        text email
        text display_name
        text avatar_url
        text role
        text status
        bool is_deleted
    }
    user_progress {
        serial id PK
        int user_id FK
        int content_id FK
        bool is_completed
        timestamptz completed_at
    }
    submissions {
        serial id PK
        int user_id FK
        int content_id FK
        varchar submission_type
        text code_content
        text url
        timestamptz submitted_at
    }
    ai_reviews {
        serial id PK
        int submission_id FK
        varchar status
        text review_content
        int overall_score
        varchar model_used
        int prompt_tokens
        int completion_tokens
        text error_message
        timestamptz reviewed_at
    }
```

---

## 3. テーブル定義

### 3.1 learning_themes（学習テーマ）

学習カリキュラムの最上位カテゴリ。複数の学習フェーズをまとめるテーマ（例：GAS学習、Webアプリ開発）。

| カラム | 型 | NULL | デフォルト | 制約 | 説明 |
|:--|:--|:--:|:--|:--|:--|
| id | SERIAL | NO | auto increment | PK | テーマID |
| name | VARCHAR(255) | NO | - | NOT NULL | テーマ名 |
| description | TEXT | YES | NULL | - | 説明文 |
| image_url | TEXT | YES | NULL | - | サムネイル画像URL |
| display_order | INTEGER | YES | 0 | - | 表示順（昇順） |
| is_published | BOOLEAN | YES | false | - | 公開フラグ |
| is_deleted | BOOLEAN | YES | false | - | 論理削除フラグ |
| created_at | TIMESTAMPTZ | YES | NOW() | - | 作成日時 |
| updated_at | TIMESTAMPTZ | YES | NOW() | トリガーで自動更新 | 更新日時 |

**サンプルデータ例**:
- GAS学習（Google Apps Scriptを使った自動化と開発の基礎）

---

### 3.2 learning_phases（学習フェーズ）

テーマ配下の学習フェーズ。Phase単位で学習内容をグループ化する。

| カラム | 型 | NULL | デフォルト | 制約 | 説明 |
|:--|:--|:--:|:--|:--|:--|
| id | SERIAL | NO | auto increment | PK | フェーズID |
| theme_id | INTEGER | NO | - | FK → learning_themes(id) ON DELETE CASCADE | 所属テーマ |
| name | VARCHAR(255) | NO | - | NOT NULL | フェーズ名 |
| description | TEXT | YES | NULL | - | 説明文 |
| display_order | INTEGER | YES | 0 | - | 表示順（昇順） |
| is_published | BOOLEAN | YES | false | - | 公開フラグ |
| is_deleted | BOOLEAN | YES | false | - | 論理削除フラグ |
| created_at | TIMESTAMPTZ | YES | NOW() | - | 作成日時 |
| updated_at | TIMESTAMPTZ | YES | NOW() | トリガーで自動更新 | 更新日時 |

**サンプルデータ例**:
- Phase 1 - GAS基礎
- Phase 2 - Web API基礎
- Phase 3 - フロントエンド基礎

---

### 3.3 learning_weeks（学習週）

フェーズ内の週単位グループ。Weekごとに学習コンテンツをまとめる。

| カラム | 型 | NULL | デフォルト | 制約 | 説明 |
|:--|:--|:--:|:--|:--|:--|
| id | SERIAL | NO | auto increment | PK | 週ID |
| phase_id | INTEGER | NO | - | FK → learning_phases(id) ON DELETE CASCADE | 所属フェーズ |
| name | VARCHAR(255) | NO | - | NOT NULL | 週名 |
| description | TEXT | YES | NULL | - | 説明文 |
| display_order | INTEGER | YES | 0 | - | 表示順（昇順） |
| is_published | BOOLEAN | YES | false | - | 公開フラグ |
| is_deleted | BOOLEAN | YES | false | - | 論理削除フラグ |
| created_at | TIMESTAMPTZ | YES | NOW() | - | 作成日時 |
| updated_at | TIMESTAMPTZ | YES | NOW() | トリガーで自動更新 | 更新日時 |

**サンプルデータ例**:
- Week 1 - はじめの一歩（Phase 1所属）
- Week 2 - スプレッドシート操作（Phase 1所属）

---

### 3.4 learning_contents（学習コンテンツ）

個別の学習教材。動画・テキスト・スライド・演習の4タイプをサポートする。

| カラム | 型 | NULL | デフォルト | 制約 | 説明 |
|:--|:--|:--:|:--|:--|:--|
| id | SERIAL | NO | auto increment | PK | コンテンツID |
| week_id | INTEGER | NO | - | FK → learning_weeks(id) ON DELETE CASCADE | 所属週 |
| title | VARCHAR(255) | NO | - | NOT NULL | タイトル |
| content_type | VARCHAR(20) | NO | - | CHECK ('video', 'text', 'exercise', 'slide') | コンテンツ種別 |
| video_url | TEXT | YES | NULL | - | YouTube URL（video時） |
| text_content | TEXT | YES | NULL | - | Markdownテキスト（text時） |
| exercise_instructions | TEXT | YES | NULL | - | 演習指示文（exercise時） |
| reference_answer | TEXT | YES | NULL | - | 模範回答（exercise時・AIレビュー採点基準・非公開） |
| hint | TEXT | YES | NULL | - | ヒント（exercise時・受講生に公開） |
| pdf_url | TEXT | YES | NULL | - | PDFファイルURL（slide時） |
| allowed_submission_types | VARCHAR(20) | NO | 'code' | CHECK ('code', 'url', 'both') | 許可する提出方法（exercise時） |
| code_language | VARCHAR(20) | NO | 'javascript' | CHECK ('javascript', 'typescript', 'html', 'css') | コードエディタの言語（exercise時） |
| display_order | INTEGER | YES | 0 | - | 表示順（昇順） |
| is_published | BOOLEAN | YES | false | - | 公開フラグ |
| is_deleted | BOOLEAN | YES | false | - | 論理削除フラグ |
| created_at | TIMESTAMPTZ | YES | NOW() | - | 作成日時 |
| updated_at | TIMESTAMPTZ | YES | NOW() | トリガーで自動更新 | 更新日時 |

**content_type別の利用カラム**:

| content_type | video_url | text_content | exercise_instructions | reference_answer | hint | pdf_url | allowed_submission_types | code_language |
|:--|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| video | 使用 | - | - | - | - | - | - | - |
| text | - | 使用 | - | - | - | - | - | - |
| exercise | - | - | 使用 | 使用 | 使用 | - | 使用 | 使用 |
| slide | - | - | - | - | - | 使用 | - | - |

**allowed_submission_types の値**:

| 値 | 動作 |
|:--|:--|
| `'code'` | コードのみ（提出方法の選択UI非表示） |
| `'url'` | URLのみ（提出方法の選択UI非表示） |
| `'both'` | コード・URL両方から選択可 |

**code_language の値**:

| 値 | 言語 |
|:--|:--|
| `'javascript'` | JavaScript / GAS（デフォルト） |
| `'typescript'` | TypeScript |
| `'html'` | HTML |
| `'css'` | CSS |

---

### 3.5 user_progress（学習進捗）

受講生のコンテンツ完了状態を管理する。

| カラム | 型 | NULL | デフォルト | 制約 | 説明 |
|:--|:--|:--:|:--|:--|:--|
| id | SERIAL | NO | auto increment | PK | 進捗ID |
| user_id | INTEGER | NO | - | FK → users(id) ON DELETE CASCADE | ユーザーID |
| content_id | INTEGER | NO | - | FK → learning_contents(id) ON DELETE CASCADE | コンテンツID |
| is_completed | BOOLEAN | YES | false | - | 完了フラグ |
| completed_at | TIMESTAMPTZ | YES | NULL | - | 完了日時 |
| created_at | TIMESTAMPTZ | YES | NOW() | - | 作成日時 |

**制約**:
- `UNIQUE(user_id, content_id)` — 1ユーザー・1コンテンツにつき1レコード
- upsert操作（`ON CONFLICT`）で完了/未完了をトグル

---

### 3.6 submissions（課題提出）

演習課題に対する受講生の提出データを管理する。

| カラム | 型 | NULL | デフォルト | 制約 | 説明 |
|:--|:--|:--:|:--|:--|:--|
| id | SERIAL | NO | auto increment | PK | 提出ID |
| user_id | INTEGER | NO | - | FK → users(id) ON DELETE CASCADE | ユーザーID |
| content_id | INTEGER | NO | - | FK → learning_contents(id) ON DELETE CASCADE | コンテンツID |
| submission_type | VARCHAR(20) | NO | - | CHECK ('code', 'url') | 提出種別 |
| code_content | TEXT | YES | NULL | - | コード内容（code時） |
| url | TEXT | YES | NULL | - | URL（url時） |
| submitted_at | TIMESTAMPTZ | YES | NOW() | - | 提出日時 |
| created_at | TIMESTAMPTZ | YES | NOW() | - | 作成日時 |

**submission_type別の利用カラム**:

| submission_type | code_content | url |
|:--|:--:|:--:|
| code | 使用 | - |
| url | - | 使用 |

**補足**: 同一コンテンツに対する複数回提出が可能（ユニーク制約なし）。

---

### 3.7 ai_reviews（AIレビュー）

演習課題の提出に対するGemini APIによる自動レビュー結果を管理する。

| カラム | 型 | NULL | デフォルト | 制約 | 説明 |
|:--|:--|:--:|:--|:--|:--|
| id | SERIAL | NO | auto increment | PK | レビューID |
| submission_id | INTEGER | NO | - | FK → submissions(id) ON DELETE CASCADE, UNIQUE | 紐づく提出ID |
| status | VARCHAR(20) | NO | 'pending' | CHECK ('pending', 'processing', 'completed', 'failed') | レビューステータス |
| review_content | TEXT | YES | NULL | - | レビュー本文 |
| overall_score | INTEGER | YES | NULL | CHECK (0 ≤ value ≤ 100) | 総合スコア（0〜100） |
| model_used | VARCHAR(100) | YES | NULL | - | 使用したGeminiモデル名 |
| prompt_tokens | INTEGER | YES | NULL | - | プロンプトトークン数 |
| completion_tokens | INTEGER | YES | NULL | - | 生成トークン数 |
| error_message | TEXT | YES | NULL | - | エラー詳細（failed時） |
| reviewed_at | TIMESTAMPTZ | YES | NULL | - | レビュー完了日時 |
| created_at | TIMESTAMPTZ | NO | NOW() | - | 作成日時 |
| updated_at | TIMESTAMPTZ | NO | NOW() | トリガーで自動更新 | 更新日時 |

**ステータス遷移**: `pending` → `processing` → `completed` / `failed`

**制約**:
- `submission_id` に UNIQUE 制約（1提出につき1レビュー）
- レビュー再実行時は既存レコードを upsert で更新

**アクセス制御**:
- 受講生: 自分の提出に紐づくレビューのみ閲覧可能（RLS）
- admin / maintainer: 全レビューの閲覧・操作可能

---

### 3.8 users（ユーザー）

本サービスの独自Supabaseプロジェクトで管理する。初回Googleログイン時にOAuthコールバックで自動作成される（`status=pending`, `role=member`）。管理者が承認後、`status=active` に変更することでサービスへのアクセスが可能になる。

| カラム | 型 | NULL | デフォルト | 説明 |
|:--|:--|:--:|:--|:--|
| id | SERIAL | NO | auto increment | ユーザーID |
| auth_id | UUID | NO | - | Supabase Auth UUID |
| email | TEXT | NO | - | メールアドレス |
| display_name | TEXT | NO | - | 表示名 |
| avatar_url | TEXT | YES | NULL | アバター画像URL |
| role | TEXT | NO | - | `admin` / `maintainer` / `member` |
| status | TEXT | NO | - | `pending` / `active` / `rejected` |
| bio | TEXT | YES | NULL | 自己紹介 |
| is_deleted | BOOLEAN | YES | false | 論理削除フラグ |
| created_at | TIMESTAMPTZ | YES | NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | YES | NOW() | 更新日時 |

---

## 4. インデックス

| インデックス名 | テーブル | 対象カラム | 用途 |
|:--|:--|:--|:--|
| idx_learning_phases_theme_id | learning_phases | theme_id | テーマ内のフェーズ検索 |
| idx_learning_weeks_phase_id | learning_weeks | phase_id | フェーズ内の週検索 |
| idx_learning_contents_week_id | learning_contents | week_id | 週内のコンテンツ検索 |
| idx_user_progress_user_id | user_progress | user_id | ユーザー別の進捗検索 |
| idx_user_progress_content_id | user_progress | content_id | コンテンツ別の進捗検索 |
| idx_submissions_user_id | submissions | user_id | ユーザー別の提出検索 |
| idx_submissions_content_id | submissions | content_id | コンテンツ別の提出検索 |
| idx_ai_reviews_status | ai_reviews | status | ステータス別のレビュー検索 |

---

## 5. トリガー

### 5.1 updated_at 自動更新トリガー

`BEFORE UPDATE` トリガーにより、レコード更新時に `updated_at` を自動更新する。

**トリガー関数**:
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

**適用テーブル**:

| トリガー名 | テーブル |
|:--|:--|
| update_learning_themes_updated_at | learning_themes |
| update_learning_phases_updated_at | learning_phases |
| update_learning_weeks_updated_at | learning_weeks |
| update_learning_contents_updated_at | learning_contents |
| update_ai_reviews_updated_at | ai_reviews |

---

## 6. Row Level Security（RLS）

全テーブルに対してRLSが有効化されている。ポリシーは `authenticated` ロール（Supabase Authで認証済みユーザー）に対して適用される。

### 6.1 学習コンテンツ系テーブル

`learning_themes`、`learning_phases`、`learning_weeks`、`learning_contents` に共通のポリシーパターン。

| ポリシー | 操作 | 対象 | 条件 |
|:--|:--|:--|:--|
| Published {table} are viewable by authenticated users | SELECT | 認証済み全ユーザー | `is_published = true AND is_deleted = false` |
| Admins can view all {table} | SELECT | admin | `users.role = 'admin'` |
| Admins can insert {table} | INSERT | admin | `users.role = 'admin'` |
| Admins can update {table} | UPDATE | admin | `users.role = 'admin'` |
| Admins can delete {table} | DELETE | admin | `users.role = 'admin'` |

**ユーザー判定ロジック**:
```sql
EXISTS (
  SELECT 1 FROM users
  WHERE users.auth_id = auth.uid()
  AND users.role = 'admin'
  AND users.is_deleted = false
)
```

### 6.2 user_progress

| ポリシー | 操作 | 対象 | 条件 |
|:--|:--|:--|:--|
| Users can view own progress | SELECT | 本人 | `user_id` が自身のユーザーIDと一致 |
| Admins can view all progress | SELECT | admin | `users.role = 'admin'` |
| Users can insert own progress | INSERT | 本人 | `user_id` が自身のユーザーIDと一致 |
| Users can update own progress | UPDATE | 本人 | `user_id` が自身のユーザーIDと一致 |

**本人判定ロジック**:
```sql
user_id IN (
  SELECT id FROM users
  WHERE auth_id = auth.uid()
  AND is_deleted = false
)
```

### 6.3 submissions

| ポリシー | 操作 | 対象 | 条件 |
|:--|:--|:--|:--|
| Users can view own submissions | SELECT | 本人 | `user_id` が自身のユーザーIDと一致 |
| Admins can view all submissions | SELECT | admin | `users.role = 'admin'` |
| Users can insert own submissions | INSERT | 本人 | `user_id` が自身のユーザーIDと一致 |

### 6.4 ai_reviews

| ポリシー | 操作 | 対象 | 条件 |
|:--|:--|:--|:--|
| Users can view own ai reviews | SELECT | 本人 | `submission_id` が自身の提出IDと一致 |
| Admins can view all ai reviews | SELECT | admin / maintainer | `users.role IN ('admin', 'maintainer')` |
| Anyone can insert ai reviews | INSERT | 認証済み全ユーザー | - |
| Anyone can update ai reviews | UPDATE | 認証済み全ユーザー | - |

---

## 7. マイグレーション管理

マイグレーションファイルは `supabase/migrations/` ディレクトリで管理する。

| ファイル | 内容 |
|:--|:--|
| `001_create_learning_tables.sql` | テーブル・インデックス・トリガーの作成 |
| `002_rls_policies.sql` | RLSの有効化とポリシー定義 |
| `003_sample_data.sql` | 開発用サンプルデータの投入 |
| `004_add_learning_themes.sql` | 学習テーマテーブルの追加 |
| `005_learning_themes_rls.sql` | 学習テーマのRLSポリシー定義 |
| `006_instructor_rls_policy.sql` | maintainerロールのRLSポリシー追加 |
| `007_create_ai_reviews.sql` | AIレビューテーブルの作成 |
| `008_add_slide_content_type.sql` | コンテンツ種別にslideを追加 |
| `009_add_reference_answer.sql` | 模範回答カラムの追加 |
| `010_seed_gas_course_contents.sql` | GAS講座コンテンツのシードデータ |
| `011_seed_gas_exercises.sql` | GAS講座演習課題のシードデータ |
| `012_add_allowed_submission_types.sql` | 演習コンテンツごとの許可提出方法カラム追加 |
| `013_add_code_language.sql` | 演習コンテンツのコードエディタ言語カラム追加 |
| `014_add_hint_column.sql` | 演習コンテンツのヒントカラム追加 |
| `015_seed_gas_hints.sql` | GAS講座全演習課題へのヒントデータ投入 |

---

## 8. 設計上の補足事項

### 8.1 論理削除
- 全コンテンツ系テーブルは `is_deleted` フラグによる論理削除を採用
- 物理削除は行わず、データの追跡性を維持する
- RLSポリシーおよびアプリ側のクエリで `is_deleted = false` をフィルタ条件に含める

### 8.2 公開制御
- `is_published` フラグにより、コンテンツの公開/非公開を制御
- 一般ユーザー（受講生）には公開済みコンテンツのみ表示される
- 管理者は公開/非公開を問わず全コンテンツを閲覧可能

### 8.3 カスケード削除
- 外部キーに `ON DELETE CASCADE` を設定
- 親テーブルのレコード削除時、子テーブルの関連レコードも自動削除される
- 実運用では論理削除を使用するため、通常はカスケード物理削除は発生しない

### 8.4 進捗管理のupsertパターン
- `user_progress` は `(user_id, content_id)` のユニーク制約を利用
- `ON CONFLICT` 句による upsert で完了/未完了のトグルを実現
- 初回完了時は INSERT、再操作時は UPDATE として処理される

---

## 改訂履歴

| 日付 | 内容 |
|:--|:--|
| 2026年2月 | 初版作成（実装に基づく） |
| 2026年3月 | learning_contentsに `allowed_submission_types` カラム追加。マイグレーション一覧を最新化 |
| 2026年3月 | learning_contentsに `code_language` カラム追加（コードエディタの言語設定） |
| 2026年3月 | learning_contentsに `hint` カラム追加（演習コンテンツへのヒント表示機能） |
| 2026年4月 | `learning_themes` テーブル追加・learning_phasesに `theme_id` FK追加。`ai_reviews` テーブル追加。ER図・インデックス・トリガー・RLS・セクション番号を全面更新 |

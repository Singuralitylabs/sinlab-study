# 機能設計書

本書は、Web技術学習支援サービスの各機能の設計詳細について記載する。

---

## 1. システムアーキテクチャ

### 1.1 全体構成

```
┌─────────────────────────────────────────────────┐
│              ブラウザ（クライアント）                │
│  ┌────────────────────┐  ┌───────────────────┐   │
│  │ Server Components   │  │ Client Components │   │
│  │ (SSR / データ取得)  │  │ (インタラクション) │   │
│  └──────────┬─────────┘  └────────┬──────────┘   │
└─────────────┼──────────────────────┼─────────────┘
              │                      │
┌─────────────┼──────────────────────┼─────────────┐
│        Next.js 16 (App Router)                    │
│  ┌──────────┴─────────┐  ┌────────┴──────────┐   │
│  │ Server Services     │  │ API Routes        │   │
│  │ (learning-server等) │  │ (/api/progress等) │   │
│  └──────────┬─────────┘  └────────┬──────────┘   │
│             │    ┌────────────────┐│              │
│             │    │  Middleware     ││              │
│             │    │ (認証・認可)    ││              │
│             │    └───────┬────────┘│              │
└─────────────┼────────────┼─────────┼─────────────┘
              │            │         │
┌─────────────┼────────────┼─────────┼─────────────┐
│         Supabase（独自プロジェクト）                 │
│  ┌──────────┴─────────┐  ┌────────┴──────────┐   │
│  │ PostgreSQL + RLS    │  │ Auth (Google OAuth)│   │
│  └────────────────────┘  └───────────────────┘   │
└───────────────────────────────────────────────────┘
```

### 1.2 レイヤー構成

| レイヤー | 責務 | 主要ファイル |
|:--|:--|:--|
| Middleware | 認証・認可ゲート | `middleware.ts` |
| Pages (Server Components) | ページレンダリング・データ取得 | `app/(authenticated)/**/page.tsx` |
| Client Components | ユーザーインタラクション | `app/(authenticated)/**/components/*.tsx` |
| API Routes | クライアントからのデータ更新 | `app/api/*/route.ts` |
| Server Services | Supabase クエリ・ビジネスロジック | `app/services/api/*.ts` |
| Auth Services | 認証・権限チェック | `app/services/auth/*.ts` |
| Providers | クライアント側状態管理 | `app/providers/*.tsx` |

---

## 2. 認証・認可機能

### 2.1 ミドルウェア認証フロー

**ファイル**: `middleware.ts`

```
リクエスト受信
    │
    ├─ 静的ファイル / API / 認証ページ → スキップ（NextResponse.next()）
    │
    ├─ Supabase Auth セッション確認
    │   ├─ 未認証 → /login にリダイレクト
    │   │
    │   └─ 認証済み → ユーザーステータス確認
    │       ├─ ステータス取得失敗 → /pending にリダイレクト
    │       ├─ pending → /pending にリダイレクト
    │       ├─ rejected → /rejected にリダイレクト
    │       └─ active → NextResponse.next()（アクセス許可）
```

**スキップ条件**:
- パスが `/_next` で始まる
- パスが `/api` で始まる
- パスが `/auth/callback` で始まる
- パスに `.` を含む（静的ファイル）
- パスが `/favicon.ico`
- パスが `/login`、`/pending`、`/rejected`

### 2.2 サーバー側認証

**ファイル**: `app/services/auth/server-auth.ts`

**関数**: `getServerAuth()`

**処理フロー**:
1. Server Side の Supabase クライアントを生成
2. `supabase.auth.getUser()` で認証ユーザーを取得
3. `users` テーブルから `auth_id` に一致するユーザー情報（`id`, `status`, `role`）を取得
4. `ServerAuthResult` を返却

**戻り値**:
```typescript
interface ServerAuthResult {
  user: User | null;        // Supabase Auth ユーザー
  userId: number | null;    // アプリ内ユーザーID
  userStatus: UserStatusType | null;  // pending / active / rejected
  userRole: UserRoleType | null;      // admin / maintainer / member
  error?: string;
}
```

### 2.3 権限チェック

**ファイル**: `app/services/auth/permissions.ts`

| 関数 | 対象ロール | 用途 |
|:--|:--|:--|
| `checkAdminPermissions(role)` | `admin` のみ | 管理ダッシュボード、受講生管理 |
| `checkContentPermissions(role)` | `admin` または `maintainer` | コンテンツ CRUD 操作 |

### 2.4 クライアント側認証

**ファイル**: `app/providers/supabase-auth-provider.tsx`

- React Context でSupabase Auth の状態を管理
- `onAuthStateChange` でリアルタイム監視
- ログアウト機能を提供

### 2.5 Googleログインフロー

本サービスは独自のSupabaseプロジェクトを使用し、Google OAuthによるログイン機能を提供する。

**ログインページ**: `app/(auth)/login/page.tsx`

**OAuthコールバックルート**: `app/(auth)/callback/route.ts`

```
ユーザー          学習支援サービス        Google OAuth       Supabase Auth
  │                    │                    │                   │
  │  1. /login にアクセス│                    │                   │
  │───────────────────>│                    │                   │
  │                    │                    │                   │
  │  2. 「Googleでログイン」クリック          │                   │
  │───────────────────>│                    │                   │
  │                    │  3. signInWithOAuth │                   │
  │                    │───────────────────────────────────────>│
  │                    │                    │                   │
  │  4. Google認証画面   │                    │                   │
  │<───────────────────────────────────────│                   │
  │                    │                    │                   │
  │  5. Googleで認証     │                    │                   │
  │───────────────────────────────────────>│                   │
  │                    │                    │  6. code返却       │
  │                    │  7. /auth/callback  │                   │
  │───────────────────>│                    │                   │
  │                    │  8. exchangeCodeForSession              │
  │                    │───────────────────────────────────────>│
  │                    │  9. session確立     │                   │
  │                    │<───────────────────────────────────────│
  │                    │                    │                   │
  │                    │  10. ユーザー初回判定  │                   │
  │                    │      (users テーブル確認)                │
  │                    │                    │                   │
  │  11. リダイレクト    │                    │                   │
  │      初回: /pending │                    │                   │
  │      承認済: /      │                    │                   │
  │<───────────────────│                    │                   │
```

**OAuthコールバック処理フロー**:
```
GET /auth/callback?code=xxx
    │
    ├─ code なし → /login にリダイレクト
    │
    ├─ supabase.auth.exchangeCodeForSession(code)
    │   │
    │   ├─ 失敗 → /login にリダイレクト
    │   │
    │   └─ 成功 → users テーブル確認
    │       │
    │       ├─ レコードなし → 自動登録 (pending) → /pending
    │       ├─ pending → /pending
    │       ├─ rejected → /rejected
    │       └─ active → / (ダッシュボード)
```

### 2.6 初回ログイン時のユーザー自動登録

OAuthコールバック処理中、またはクライアント側の `onAuthStateChange` で初回ログインを検知し、`users` テーブルにレコードを自動作成する。

**自動登録データ**:

| カラム | 値 | 取得元 |
|:--|:--|:--|
| `auth_id` | Supabase Auth UUID | `user.id` |
| `email` | Googleアカウントのメール | `user.email` |
| `display_name` | Google表示名 | `user.user_metadata.full_name` |
| `avatar_url` | Googleアバター画像 | `user.user_metadata.avatar_url` |
| `role` | `member` | デフォルト値 |
| `status` | `pending` | デフォルト値 |

### 2.7 ユーザーステータスによるアクセス制御

```
ログイン成功後
    │
    ├─ users テーブルにレコードなし
    │   → 自動登録 (status=pending) → /pending にリダイレクト
    │
    ├─ status = pending
    │   → /pending にリダイレクト（承認待ち画面）
    │
    ├─ status = rejected
    │   → /rejected にリダイレクト（却下画面）
    │
    └─ status = active
        → / (ダッシュボード) にリダイレクト
```

### 2.8 ユーザー管理（管理者向け）

**パス**: `/admin/users`

**アクセス権限**: `admin` ロールのみ

**機能**:
- 全ユーザー一覧の表示（ステータスでフィルタ可能）
- ユーザーの承認（`pending` → `active`）
- ユーザーの却下（`pending` → `rejected`）
- ステータス変更のリカバリ（`rejected` → `active`）

**表示項目**:

| 項目 | 説明 |
|:--|:--|
| 表示名 | Googleアカウントの名前 |
| メールアドレス | Googleアカウントのメール |
| ロール | `admin` / `maintainer` / `member` |
| ステータス | `pending` / `active` / `rejected` |
| 登録日時 | 初回ログイン日時 |
| 操作 | 承認 / 却下ボタン |

### 2.9 ログアウト機能

**実装箇所**: SideNavコンポーネント

**処理**:
1. `supabase.auth.signOut()` を呼び出し
2. `/login` にリダイレクト

### 2.10 認証セキュリティ

#### 認証レイヤー

| レイヤー | 保護対象 | 方式 |
|:--|:--|:--|
| Middleware | 全ページ | Supabase Auth セッション + ユーザーステータス確認 |
| AuthLayout | Client Components | `useSupabaseAuth()` フックによるクライアント側ガード |
| RLS | データベース | `auth.uid()` によるRow Level Security |
| API Routes | データ更新操作 | `getApiAuth()` によるサーバー側認証 |

#### OAuth セキュリティ

| 項目 | 対策 |
|:--|:--|
| PKCE | Supabase Auth が自動的にPKCEフローを使用 |
| CSRF保護 | OAuth stateパラメータによるCSRF防止（Supabase管理） |
| セッション管理 | HTTP-only cookieでセッショントークンを管理 |
| トークン更新 | リフレッシュトークンによる自動更新 |

#### 承認フローのセキュリティ

| リスク | 対策 |
|:--|:--|
| 未承認ユーザーのアクセス | ミドルウェア + RLSの二重チェック |
| ステータス改ざん | `users` テーブルの更新はRLSでadminロールのみに制限 |
| 自動登録の悪用 | Googleアカウントが必要。登録後は `pending` で管理者の承認が必須 |

### 2.11 Supabase Auth 設定

#### Google OAuth プロバイダー設定

Supabaseダッシュボードの Authentication > Providers で設定する。

**必要な情報**:
- Google Cloud ConsoleのOAuth 2.0クライアントID
- Google Cloud ConsoleのOAuth 2.0クライアントシークレット
- リダイレクトURI: `https://<supabase-project-id>.supabase.co/auth/v1/callback`

**Google Cloud Console側の設定**:
- 承認済みリダイレクトURI: Supabaseが提供するコールバックURLを追加
- 承認済みJavaScript生成元: 本アプリのドメインを追加

#### Supabase Auth URL設定

| 設定項目 | 値 |
|:--|:--|
| Site URL | 本アプリのURL（`http://localhost:3000` / 本番URL） |
| Redirect URLs | `http://localhost:3000/auth/callback`, `https://本番ドメイン/auth/callback` |

---

## 3. 学習コンテンツ配信機能

### 3.1 コンテンツ取得サービス

**ファイル**: `app/services/api/learning-server.ts`

| 関数 | 戻り値 | 説明 |
|:--|:--|:--|
| `fetchPublishedPhases()` | `LearningPhase[]` | 公開フェーズ一覧（`is_published=true`, `is_deleted=false`）|
| `fetchPhaseById(phaseId)` | `LearningPhase` | フェーズ詳細 |
| `fetchWeeksByPhaseId(phaseId)` | `LearningWeek[]` | フェーズ内の公開週一覧 |
| `fetchWeekById(weekId)` | `LearningWeek & { phase }` | 週詳細（フェーズ情報付き） |
| `fetchContentsByWeekId(weekId)` | `LearningContent[]` | 週内の公開コンテンツ一覧 |
| `fetchContentById(contentId)` | `LearningContentWithWeek` | コンテンツ詳細（週・フェーズ情報付き） |

**共通フィルタ条件**: `is_published = true AND is_deleted = false`
**共通ソート順**: `display_order` 昇順

### 3.2 コンテンツ種別ごとの表示

#### 動画教材（video）
- `react-youtube` コンポーネントでYouTube動画を埋め込み
- `video_url` からYouTube Video IDを自動抽出
- レスポンシブ対応のプレーヤーサイズ

#### テキスト教材（text）
- `text_content` をMarkdownとして保存
- `react-markdown` + `remark-gfm` でレンダリング（GitHub Flavored Markdown対応）
- `isomorphic-dompurify` による出力前のXSSサニタイズ

#### 演習課題（exercise）
- `exercise_instructions` をMarkdownとして保存・表示
- 課題提出フォーム（SubmissionForm コンポーネント）と連携

### 3.3 画面遷移

```
/learn（Phase一覧）
   │
   └─ /learn/[phaseId]（Week一覧）
        │
        └─ /learn/[phaseId]/[weekId]（コンテンツ一覧）
             │
             └─ /learn/[phaseId]/[weekId]/[contentId]（コンテンツ詳細）
```

各階層でパンくずリスト（PageTitle コンポーネント）を表示し、上位階層への導線を提供する。

---

## 4. 進捗管理機能

### 4.1 進捗記録 API

**エンドポイント**: `POST /api/progress`

**ファイル**: `app/api/progress/route.ts`

**リクエストボディ**:
```json
{
  "contentId": 1,
  "userId": 1,
  "isCompleted": true
}
```

**処理フロー**:
1. リクエストボディのバリデーション（`contentId`, `userId` は必須）
2. Supabase Auth による認証チェック
3. `auth_id` → `users.id` の照合によるユーザーID検証
4. `user_progress` テーブルへの upsert（`ON CONFLICT user_id, content_id`）
   - `isCompleted = true` の場合: `completed_at` に現在日時を設定
   - `isCompleted = false` の場合: `completed_at` を null に設定
5. レスポンス返却

**レスポンス**:
| ステータス | ボディ | 条件 |
|:--|:--|:--|
| 200 | `{ success: true, isCompleted: boolean }` | 正常 |
| 400 | `{ error: "contentIdとuserIdは必須です" }` | バリデーションエラー |
| 401 | `{ error: "認証が必要です" }` | 未認証 |
| 403 | `{ error: "権限がありません" }` | ユーザーID不一致 |
| 500 | `{ error: "..." }` | サーバーエラー |

### 4.2 進捗取得サービス

**ファイル**: `app/services/api/learning-server.ts`

| 関数 | 説明 |
|:--|:--|
| `fetchUserProgressByContentIds(userId, contentIds)` | 複数コンテンツの進捗を一括取得。`Map<contentId, isCompleted>` を返却 |
| `fetchUserProgressByContentId(userId, contentId)` | 単一コンテンツの進捗を取得。`isCompleted: boolean` を返却 |

### 4.3 進捗集計ロジック

ダッシュボードおよび一覧画面で表示する進捗率の計算方法。

```
progressPercent = (completedContents / totalContents) * 100
```

**集計レベル**:
- **全体**: 全公開コンテンツ中の完了数
- **Phase単位**: Phase配下の全Weekの全コンテンツ中の完了数
- **Week単位**: Week配下の全コンテンツ中の完了数

**型定義**:
```typescript
interface PhaseProgress {
  phase: LearningPhase;
  totalContents: number;
  completedContents: number;
  progressPercent: number;
}

interface WeekProgress {
  week: LearningWeek;
  totalContents: number;
  completedContents: number;
  progressPercent: number;
}
```

---

## 5. 課題提出機能

### 5.1 課題提出 API

**エンドポイント**: `POST /api/submissions`

**ファイル**: `app/api/submissions/route.ts`

**リクエストボディ**:
```json
{
  "contentId": 1,
  "userId": 1,
  "submissionType": "code",
  "codeContent": "function myFunction() { ... }",
  "url": null
}
```

**処理フロー**:
1. リクエストボディのバリデーション
   - `contentId`, `userId`, `submissionType` は必須
   - `submissionType = "code"` の場合: `codeContent` は必須
   - `submissionType = "url"` の場合: `url` は必須
2. Supabase Auth による認証チェック
3. `auth_id` → `users.id` の照合によるユーザーID検証
4. `submissions` テーブルへの INSERT
   - `code` タイプ: `code_content` にコードを保存、`url` は null
   - `url` タイプ: `url` にURLを保存、`code_content` は null
5. レスポンス返却

**レスポンス**:
| ステータス | ボディ | 条件 |
|:--|:--|:--|
| 200 | `{ success: true, submission: Submission }` | 正常 |
| 400 | `{ error: "..." }` | バリデーションエラー |
| 401 | `{ error: "認証が必要です" }` | 未認証 |
| 403 | `{ error: "権限がありません" }` | ユーザーID不一致 |
| 500 | `{ error: "..." }` | サーバーエラー |

### 5.2 提出履歴取得サービス

**ファイル**: `app/services/api/submissions-server.ts`

| 関数 | 対象 | 説明 |
|:--|:--|:--|
| `fetchSubmissionsByUserId(userId)` | 受講生 | 自分の提出履歴を取得（コンテンツ情報付き）、提出日時の降順 |
| `fetchAllSubmissions()` | 管理者 | 全受講生の提出一覧を取得（ユーザー・コンテンツ情報付き）、提出日時の降順 |

---

## 6. 管理機能

### 6.1 コンテンツ管理サービス

**ファイル**: `app/services/api/admin-server.ts`

#### フェーズ管理

| 関数 | 操作 | 説明 |
|:--|:--|:--|
| `fetchAllPhases()` | READ | 全フェーズ一覧（`is_deleted=false`、`display_order` 順） |
| `createPhase(phase)` | CREATE | フェーズ新規作成 |
| `updatePhase(id, phase)` | UPDATE | フェーズ更新 |
| `deletePhase(id)` | DELETE | フェーズ論理削除（`is_deleted = true`） |

#### 週管理

| 関数 | 操作 | 説明 |
|:--|:--|:--|
| `fetchAllWeeks()` | READ | 全週一覧（フェーズ情報付き、`is_deleted=false`） |
| `createWeek(week)` | CREATE | 週新規作成（`phase_id` 必須） |
| `updateWeek(id, week)` | UPDATE | 週更新 |
| `deleteWeek(id)` | DELETE | 週論理削除 |

#### コンテンツ管理

| 関数 | 操作 | 説明 |
|:--|:--|:--|
| `fetchAllContents()` | READ | 全コンテンツ一覧（週・フェーズ情報付き、`is_deleted=false`） |
| `createContent(content)` | CREATE | コンテンツ新規作成（`week_id`, `content_type` 必須） |
| `updateContent(id, content)` | UPDATE | コンテンツ更新 |
| `deleteContent(id)` | DELETE | コンテンツ論理削除 |

### 6.2 受講生管理サービス

**ファイル**: `app/services/api/admin-server.ts`

**関数**: `fetchStudentsProgress()`

**処理フロー**:
1. `status = "active"` かつ `is_deleted = false` のユーザー一覧を取得
2. 公開コンテンツの総数を取得
3. 各ユーザーについて並列で進捗情報を取得（`Promise.all`）
4. 完了数と最終アクティビティ日時を集計

**戻り値**:
```typescript
interface StudentProgress {
  user: Pick<UserType, "id" | "display_name" | "email">;
  totalContents: number;
  completedContents: number;
  lastActivity: string | null;
}
```

### 6.3 管理ダッシュボード統計

管理ダッシュボード（`/admin`）に表示する統計情報:

| 指標 | 取得元 |
|:--|:--|
| フェーズ数 | `fetchAllPhases()` の件数 |
| 週数 | `fetchAllWeeks()` の件数 |
| コンテンツ数 | `fetchAllContents()` の件数 |
| 受講生数 | `fetchStudentsProgress()` の件数 |
| 提出数 | `fetchAllSubmissions()` の件数 |
| 最近の提出 | `fetchAllSubmissions()` の先頭5件 |

---

## 7. 画面設計

### 7.1 認証系画面

#### ログイン画面（`/login`）

**表示内容**:
- サービスロゴ / サービス名
- 「Googleでログイン」ボタン
- サービスの簡単な説明文

**デザイン方針**:
- シンプルで中央寄せのレイアウト
- ダークモード対応

---

#### 承認待ち画面（`/pending`）

**表示内容**:
- 「承認待ちです」のメッセージ
- 管理者に承認を依頼する案内文
- ログアウトボタン

---

#### 却下画面（`/rejected`）

**表示内容**:
- 「アクセスが却下されました」のメッセージ
- 管理者への問い合わせ案内
- ログアウトボタン

---

### 7.2 受講生向け画面

#### ダッシュボード（`/`）

**データ取得**: `fetchPublishedPhases()` + 各Phase配下のコンテンツ進捗を集計

**表示内容**:
- 全体進捗率（%表示）
- Phase別進捗バー（Phase名、完了数/総数、パーセンテージ）
- 学習開始への導線リンク

---

#### コンテンツ一覧（`/learn`）

**データ取得**: `fetchPublishedPhases()`

**表示内容**: 公開Phaseのカード一覧（名前、説明、表示順）

---

#### Week一覧（`/learn/[phaseId]`）

**データ取得**: `fetchPhaseById()` + `fetchWeeksByPhaseId()` + 進捗情報

**表示内容**:
- パンくずリスト（トップ > Phase名）
- Week カード一覧（名前、説明、進捗バー）

---

#### コンテンツ一覧（`/learn/[phaseId]/[weekId]`）

**データ取得**: `fetchWeekById()` + `fetchContentsByWeekId()` + `fetchUserProgressByContentIds()`

**表示内容**:
- パンくずリスト（トップ > Phase名 > Week名）
- コンテンツリスト（タイトル、種別アイコン、完了チェック）

---

#### コンテンツ詳細（`/learn/[phaseId]/[weekId]/[contentId]`）

**データ取得**: `fetchContentById()` + `fetchUserProgressByContentId()`

**表示内容**:
- パンくずリスト（トップ > Phase名 > Week名 > コンテンツ名）
- コンテンツ本体（種別に応じて動画/テキスト/演習を表示）
- 完了ボタン（CompleteButton）
- 提出フォーム（SubmissionForm、exercise タイプの場合のみ）
- 前後コンテンツへのナビゲーションリンク

---

#### 提出履歴（`/submissions`）

**データ取得**: `fetchSubmissionsByUserId()`

**表示内容**: 提出一覧（提出日時、コンテンツ名、提出タイプ、内容プレビュー）

---

### 7.3 管理者向け画面

#### 管理ダッシュボード（`/admin`）

**アクセス権限**: `admin` ロールのみ

**表示内容**: 統計カード + 最近の提出リスト

---

#### 受講生一覧（`/admin/students`）

**データ取得**: `fetchStudentsProgress()`

**表示内容**: テーブル形式（表示名、メール、進捗率、最終アクティビティ）

---

#### 提出管理（`/admin/submissions`）

**データ取得**: `fetchAllSubmissions()`

**表示内容**: テーブル形式（受講生名、コンテンツ名、提出タイプ、提出日時）

---

#### コンテンツ管理（`/admin/phases`, `/admin/weeks`, `/admin/contents`）

**アクセス権限**: `admin` または `maintainer` ロール

**操作**: CRUD（一覧表示、新規作成、編集、論理削除）

---

## 8. 共通UIコンポーネント設計

### 8.1 SideNav

**ファイル**: `app/(authenticated)/components/side-nav.tsx`

**責務**: アプリケーション全体のナビゲーション

**動作**:
- デスクトップ: 固定サイドバー
- モバイル: ハンバーガーメニュー + ドロワー
- 管理者ロールの場合: 管理メニュー項目を動的表示
- ログアウト機能を含む
- アクティブルートのハイライト表示

### 8.2 PageTitle

**ファイル**: `app/components/page-title.tsx`

**責務**: ページヘッダーとパンくずリストの表示

### 8.3 MarkdownRenderer

**ファイル**: `app/components/markdown-renderer.tsx`

**責務**: Markdown コンテンツの安全なレンダリング

**処理**:
1. 入力テキストを `isomorphic-dompurify` でサニタイズ
2. `react-markdown` + `remark-gfm` でHTMLにレンダリング
3. `@tailwindcss/typography` でスタイリング

### 8.4 YouTubeEmbed

**ファイル**: `app/components/youtube-embed.tsx`

**責務**: YouTube動画の埋め込み表示

**処理**:
1. YouTube URL から Video ID を正規表現で抽出
2. `react-youtube` コンポーネントで埋め込み表示

### 8.5 CompleteButton

**ファイル**: `app/(authenticated)/learn/[phaseId]/[weekId]/[contentId]/components/complete-button.tsx`

**責務**: コンテンツ完了状態のトグル

**動作**:
1. 現在の完了状態を表示（完了 / 未完了）
2. クリックで `POST /api/progress` を呼び出し
3. ローディング状態を表示
4. レスポンスに基づきUIを更新

### 8.6 SubmissionForm

**ファイル**: `app/(authenticated)/learn/[phaseId]/[weekId]/[contentId]/components/submission-form.tsx`

**責務**: 課題提出フォーム

**動作**:
1. 提出タイプの選択（code / url）
2. タイプに応じた入力フォーム表示
   - code: テキストエリア
   - url: URLインプット
3. `POST /api/submissions` で提出
4. 成功メッセージの表示

---

## 9. サービスレイヤー設計

### 9.1 Supabaseクライアント

| ファイル | 用途 | 使用場所 |
|:--|:--|:--|
| `app/services/api/supabase-server.ts` | サーバーサイドSupabaseクライアント（Cookie管理付き） | Server Components, API Routes |
| `app/services/api/supabase-client.ts` | クライアントサイドSupabaseクライアント | Client Components |

### 9.2 ユーザーサービス

**ファイル**: `app/services/api/users-server.ts`

| 関数 | 説明 |
|:--|:--|
| `fetchUserStatusByIdInServer({ authId })` | `auth_id` からユーザーステータスを取得。ミドルウェアで使用 |
| `fetchUserInfoByAuthId({ authId })` | `auth_id` からユーザーID・ロールを取得 |

**ファイル**: `app/services/api/users-client.ts`

クライアントサイドでのユーザー情報取得用。

---

## 10. エラーハンドリング設計

### 10.1 API Routes

| エラー種別 | HTTPステータス | ハンドリング |
|:--|:--|:--|
| バリデーションエラー | 400 | リクエストボディの必須項目チェック |
| 認証エラー | 401 | Supabase Auth のセッション不在 |
| 認可エラー | 403 | ユーザーID不一致（他人のデータ操作を防止） |
| Supabase エラー | 500 | DB操作失敗（`console.error` でログ出力） |
| 予期しないエラー | 500 | try-catch による一括ハンドリング |

### 10.2 認証エラー

| ケース | 対応 |
|:--|:--|
| Google認証キャンセル | `/login` に戻り、エラーメッセージを表示 |
| OAuth コード交換失敗 | `/login` にリダイレクト |
| セッション期限切れ | ミドルウェアが `/login` にリダイレクト |
| Supabase接続エラー | エラーログ出力、`/login` にリダイレクト |
| `users` テーブルへの INSERT 失敗 | エラーログ出力。ステータス確認不可のため `/pending` 表示 |
| 重複登録の試行 | `auth_id` のUNIQUE制約で防止。既存レコードを使用 |

### 10.3 Server Services

- 全サービス関数は `{ data, error }` パターンで結果を返却
- エラー時は `console.error` でサーバーログに出力
- 呼び出し元（ページコンポーネント）でエラーに応じたUI表示を制御

---

## 改訂履歴

| 日付 | 内容 |
|:--|:--|
| 2026年2月 | 初版作成（実装に基づく） |
| 2026年3月 | 認証方式を独立認証（Googleログイン + ユーザー承認）に変更。ミドルウェアフロー更新、Googleログイン・ユーザー管理セクション追加 |
| 2026年3月 | 認証設計書を統合。Googleログインフロー詳細、セキュリティ設計、Supabase Auth設定、認証系画面設計、認証エラーハンドリングを追加 |

# テスト設計書

## 目次

1. [概要](#1-概要)
2. [テスト方針](#2-テスト方針)
    - [2.1 テストピラミッドと優先度](#21-テストピラミッドと優先度)
    - [2.2 実行タイミング（PR / リリース前）](#22-実行タイミングpr--リリース前)
    - [2.3 テストデータ方針](#23-テストデータ方針)
    - [2.4 可観測性](#24-可観測性)
3. [テスト対象と観点](#3-テスト対象と観点)
    - [3.1 サービス層ユニットテスト](#31-サービス層ユニットテスト)
    - [3.2 セキュリティテスト](#32-セキュリティテスト)
    - [3.3 型安全性テスト](#33-型安全性テスト)
    - [3.4 ビルドテスト](#34-ビルドテスト)
    - [3.5 コード品質テスト](#35-コード品質テスト)
    - [3.6 E2Eテスト（未実装・リリース前のみ）](#36-e2eテスト未実装リリース前のみ)
4. [CI / ツール構成](#4-ci--ツール構成)
    - [4.1 GitHub Actions ワークフロー](#41-github-actions-ワークフロー)
    - [4.2 導入済みツール / 導入予定ツール](#42-導入済みツール--導入予定ツール)
    - [4.3 実行環境](#43-実行環境)
5. [テスト規約](#5-テスト規約)

## 1. 概要

本ドキュメントは「AIと学ぶ実践Web技術講座」スキルアップサービスのテスト方針、テスト対象と観点、CI/ツール構成を整理する。

## 2. テスト方針

### 2.1 テストピラミッドと優先度

```text
    E2E Tests (少数)
  Integration Tests (中程度)
Unit Tests (多数)
```

- **狙い**: 変更頻度が高く壊れやすい領域は Unit/静的検査で早期に検知し、統合・E2E は本数を絞って「破綻していないこと」を確認する。
- **優先度の決め方**: 変更頻度・影響範囲・障害時コストの観点で、認証/認可、データ整合性、ビルド成立性を優先する。

### 2.2 実行タイミング（PR / リリース前）

PR では短時間で完了するチェックを必須とし、リリース前は範囲を絞った確認を追加する。

- **PR（原則）**: 変更内容に応じて CI が自動実行される（型チェック、Lint、ビルド、ユニットテスト、デバッグ出力検知）。
- **リリース前**: 影響範囲が広い変更（例: 認証/認可、学習コンテンツ配信、進捗管理）に対して、主要フローの手動確認（または最小限のE2E）を追加する。

CI のワークフロー一覧は [4.1 GitHub Actions ワークフロー](#41-github-actions-ワークフロー) に記載する。

### 2.3 テストデータ方針

- **原則**: Unit テストはモック/スタブで独立性を確保し、外部依存（Supabase等）は直接叩かない。
- **統合確認が必要な場合**: 専用環境とシードデータを前提に、対象を最小限に絞って再現性を担保する。

### 2.4 可観測性

- **失敗時の調査容易性**: テストが失敗した際に原因を素早く特定できるよう、
  確認観点ごとにチェックを分離し、テスト名やジョブ名から目的が読み取れる命名にする。
- **ログの扱い**: 開発時のデバッグ出力（`console.log` 等）がコードに残った場合は
  CIで検知してエラーにする。一方、障害調査に必要なログ（エラーログ等）は意図的に残す。

## 3. テスト対象と観点

### 3.1 サービス層ユニットテスト

サービス層（ビジネスロジック）の正しさを、外部I/Oから切り離して確認する。

- **観点**
  - 代表的な正常系（CRUDの代表ケース）
  - 入力のバリデーション（代表ケース）
  - 戻り値の型・構造が想定どおりであること（代表レスポンス）
  - 代表的な失敗（例: ネットワーク失敗、制約違反）時の扱い
- **対象領域（最小範囲の例）**
  - 認証・権限チェック（`app/services/auth/`）
  - 学習コンテンツ取得（フェーズ・週・コンテンツ一覧/詳細）
  - 進捗管理（進捗upsert）
  - 提出物管理（作成）
  - ユーザー管理（承認・却下）

### 3.2 セキュリティテスト

認証・認可・承認ステータスの制御が、意図した振る舞いを満たすことを確認する。

本プロジェクトのセキュリティテストは、**単体で確認できる部分はユニット**、**実際の認証フローに関わる部分は統合/ E2E**に分類する。

- **観点**

| 観点 | CI（自動） | 手動 |
| --- | --- | --- |
| 認証制御 | 認証ヘルパー関数の判定ロジック | 未認証ユーザーのリダイレクト |
| 認可制御 | 権限判定ロジック（admin/maintainer/member 別の許可/拒否） | UI・ミドルウェアでのアクセス制御 |
| 承認ステータス制御 | ステータス判定ロジック（pending/rejected） | 画面遷移の正当性 |
| データアクセス | ―（ユニットでは検証困難） | RLSによるデータ分離 |

### 3.3 型安全性テスト

TypeScript と型生成の運用によって、型の破綻を早期に検知する。

- **観点**
  - **コンポーネント/ロジック型**: 型チェックにより型不整合を検知する
  - **データベース型**: `bun run db:types` による型生成と差分確認により、スキーマと型定義の整合性を保つ

### 3.4 ビルドテスト

本番相当のビルドが成立することを確認する。

- **観点**
  - 本番相当のビルドが完走する
  - 依存関係のインストールが lockfile どおりに成功する

### 3.5 コード品質テスト

デバッグ用出力の混入と Lint エラーを早期に検知する。

- **観点**
  - **デバッグ出力**: `console.log` / `console.info` / `debugger` の混入を検知して失敗させる
  - **Biome Lint/Format**: `bun run check` によるコードスタイル・静的解析の一括確認

### 3.6 E2Eテスト（未実装・リリース前のみ）

実ユーザー視点の主要ジャーニーを、少数のケースで確認する（全網羅はしない）。

- **実施条件**: リリース前、または影響範囲が大きい変更（認証/認可、学習コンテンツ配信、主要画面の動線）
- **実施方法**: 単一ブラウザで、主要フローを1〜2本確認する（当面は手動）
- **対象フロー例**
  - Google ログイン → ダッシュボード表示 → コンテンツ閲覧 → ログアウト
  - 進捗の記録 → ダッシュボードへの反映
  - admin/maintainer による管理操作（フェーズ・週・コンテンツ管理）→ 一覧/詳細への反映
  - pending/rejected ユーザーが保護ページへアクセス → 適切な誘導（`/pending` / `/rejected`）
  - 演習コンテンツへの提出物作成 → 提出履歴への反映

## 4. CI / ツール構成

### 4.1 GitHub Actions ワークフロー

GitHub Actions は CI/CD の実行基盤として利用する。詳細は各ワークフロー定義を参照する。

| Workflow | 目的 | 主な実行内容 | トリガー |
| --- | --- | --- | --- |
| Build Test ([.github/workflows/build.yml](../.github/workflows/build.yml)) | 本番相当のビルド成立性を検証 | 依存関係インストール + ビルド | `push` / `pull_request`（`app/**`）、`workflow_dispatch` |
| TypeScript Type Check ([.github/workflows/typecheck.yml](../.github/workflows/typecheck.yml)) | 型安全性の早期検出 | 型チェック（`tsc --noEmit`） | `push` / `pull_request`（`app/**`, `*.ts(x)` 等）、`workflow_dispatch` |
| Vitest Unit Tests ([.github/workflows/test.yml](../.github/workflows/test.yml)) | ユニットテスト実行 | ユニットテスト（Vitest） | `push` / `pull_request`（`app/**`, `tests/**`, `vitest.config.ts`, `package.json`）、`workflow_dispatch` |
| Biome Check ([.github/workflows/biome.yml](../.github/workflows/biome.yml)) | Lint/フォーマット違反を防止 | `bun run check`（Biome lint + format） | `push` / `pull_request`（`app/**`）、`workflow_dispatch` |
| Check console.log and debugger ([.github/workflows/check_console_log.yml](../.github/workflows/check_console_log.yml)) | デバッグ用出力の混入を防止 | console/debugger 検査 | `push` / `pull_request`（`app/**`）、`workflow_dispatch` |
| Supabase DB Types Consistency ([.github/workflows/db-types.yml](../.github/workflows/db-types.yml)) | DB 型定義の整合性監視（準備中） | 依存関係インストール（型生成/差分チェックは保留） | `push` / `pull_request`（`supabase/**`, `app/types/lib/database.types.ts` 等）、`workflow_dispatch` |

### 4.2 導入済みツール / 導入予定ツール

**導入済み**

- **TypeScript**: 型チェック（`tsc --noEmit`）
- **Biome**: Lint + フォーマット（`bun run check`）
- **Vitest**: ユニットテスト実行基盤（Bun / Next.js との親和性が高い）
- **Supabase CLI**: 型生成・スキーマ整合性確認（CI は準備中、現状は手動）

**導入予定**

- **カスタムスクリプト**: デバッグ出力検査（`lint:logs`）

### 4.3 実行環境

- **Bun**: パッケージマネージャー兼実行環境（CI でも bun を使用）
- **Node.js 20.x**: bun が利用できない CI ステップの代替実行環境
- **Next.js 16**: 本番ビルド互換の検証

## 5. テスト規約

### テストファイルの配置

- 原則としてテストコードは `tests/` 配下に配置する。
- ディレクトリ構成は、対象コード（例: `app/` 配下）の構造に寄せて配置する。

### ファイル名の命名

- Vitest は `*.test.ts` / `*.spec.ts` をテストとして実行できるが、本プロジェクトでは `*.test.ts` に統一する。
- テストファイル名は「対象 + 期待する振る舞い」が想像できる名前にする。

例:

- `tests/services/auth/permissions.test.ts`
- `tests/services/auth/server-auth.test.ts`
- `tests/services/api/learning-server.test.ts`

### テストの検証対象

- **検証する**: 関数の入力に対する出力（返り値）、副作用の結果（状態変化）、エラー時の振る舞い
- **検証しない**: 内部実装の呼び出し手順（クエリメソッドをどの引数で呼んだか等）
- モックは外部依存を切り離すために使用するが、モック呼び出し引数の逐次検証は原則行わない
- 返り値を持たない関数は、副作用の結果（更新値・更新対象）が正しいことを検証する

### 現在の実装済みテスト一覧

| テストスクリプト | テスト対象スクリプト | 対象関数 | テスト内容の概要 |
| --- | --- | --- | --- |
| `tests/services/auth/permissions.test.ts` | `app/services/auth/permissions.ts` | `checkAdminPermissions`, `checkContentPermissions`, `checkInstructorPermissions` | ロール（admin/maintainer/member/unknown）ごとの権限判定（許可/拒否）を検証する。 |
| `tests/services/auth/server-auth.test.ts` | `app/services/auth/server-auth.ts` | `getServerAuth` | 認証エラー、ユーザー情報取得失敗、ステータス別応答、例外時の戻り値とエラーハンドリングを検証する。 |
| `tests/services/api/learning-server.test.ts` | `app/services/api/learning-server.ts` | 学習コンテンツ取得関数群 | フェーズ・週・コンテンツの取得正常系/異常系を検証する。 |
| `tests/services/api/users-server.test.ts` | `app/services/api/users-server.ts` | ユーザー取得・更新関数群 | ユーザーステータス取得、ユーザー情報取得の正常系/異常系を検証する。 |
| `tests/services/api/users-client.test.ts` | `app/services/api/users-client.ts` | ユーザー承認・却下関数群 | 承認・却下操作の戻り値・エラーハンドリングを検証する。 |

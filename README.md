# Sinlab Study - Web技術学習支援サービス

「AIと学ぶ実践Web技術講座」の学習フェーズを支援するWebアプリケーション。
受講生向けの学習コンテンツ配信・進捗管理・課題提出・AIレビュー機能と、運営向けの管理機能を提供する。

## 主な機能

- **学習コンテンツ配信** — Theme > Phase > Week > コンテンツの4階層構造で、動画・テキスト・演習・スライドを配信
- **進捗管理** — コンテンツ単位の完了トグルと、ダッシュボードでの進捗率表示
- **課題提出** — コード貼り付けまたはURL共有による演習課題の提出
- **AIレビュー** — 提出コードに対してGemini APIによる自動レビューを実施
- **管理機能** — コンテンツCRUD（テーマ管理含む）、受講生進捗一覧、提出管理、統計ダッシュボード

## 技術スタック

| 項目 | 技術 |
|:--|:--|
| フレームワーク | Next.js 16 (App Router) |
| UI | React 19 / Tailwind CSS 4 / Shadcn/UI |
| 言語 | TypeScript 5 |
| ランタイム | Bun |
| バックエンド / DB / 認証 | Supabase (PostgreSQL + Auth + RLS + Storage) |
| AI | Google Gemini API (@google/generative-ai) |
| コードエディタ | CodeMirror 6 |
| コード品質 | Biome |
| ホスティング | Vercel |

## セットアップ

### 前提条件

- [Bun](https://bun.sh/) がインストール済みであること
- Supabase プロジェクトが作成済みであること

### 環境変数

`.env.local` を作成し、以下の環境変数を設定する（`.env.local.example` 参照）。

```
NEXT_PUBLIC_SUPABASE_URL=<Supabase プロジェクトURL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase Publishable Key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase Service Role Key>
SUPABASE_PROJECT_ID=<Supabase プロジェクトID>
GEMINI_API_KEY=<Gemini API Key（AIレビュー機能用）>
```

### インストール・起動

```bash
# 依存関係のインストール
bun install

# データベースマイグレーション（Supabase CLIを使用）
bunx supabase db push

# 開発サーバー起動
bun dev
```

`http://localhost:3000` でアクセス可能。

### 主要なスクリプト

| コマンド | 説明 |
|:--|:--|
| `bun dev` | 開発サーバー起動（Turbopack） |
| `bun run build` | プロダクションビルド |
| `bun start` | プロダクションサーバー起動 |
| `bun run lint` | Biome によるリント |
| `bun run format` | Biome によるフォーマット |
| `bun run check` | Biome によるリント + フォーマット |
| `bun run db:types` | Supabase から TypeScript 型定義を生成 |
| `bun run test` | Vitest によるユニットテスト実行 |
| `bun run test:all` | build/db:types/lint/format/check/test を一括実行 |

## プロジェクト構成

```
app/
├── (authenticated)/     # 認証必須のページ群
│   ├── admin/           #   管理者専用画面（/admin/users のみ。他は /manage にリダイレクト）
│   ├── manage/          #   コンテンツ管理画面（admin + maintainer 共通）
│   ├── instructor/      #   講師向け画面（/manage にリダイレクト）
│   ├── learn/           #   学習コンテンツ画面（Theme > Phase > Week > Content の4階層）
│   ├── submissions/     #   提出履歴画面
│   ├── components/      #   認証済みレイアウト用コンポーネント
│   └── page.tsx         #   ダッシュボード
├── api/                 # API Routes
│   ├── admin/users/     #   ユーザー承認・却下・ロール変更
│   ├── ai-review/       #   AIレビュー（Gemini API）
│   ├── manage/          #   コンテンツ管理（phases/weeks/contents/themes）
│   ├── progress/        #   進捗更新
│   ├── submissions/     #   課題提出
│   └── upload-pdf/      #   PDFスライドアップロード（Supabase Storage）
├── components/          # 共通UIコンポーネント
├── constants/           # 定数定義
├── providers/           # React Context Providers
├── services/            # サービスレイヤー
│   ├── api/             #   Supabase クエリ・Gemini APIクライアント
│   └── auth/            #   認証・権限チェック
└── types/               # TypeScript 型定義
supabase/
└── migrations/          # DBマイグレーションSQL
middleware.ts            # 認証ミドルウェア
docs/                    # 設計ドキュメント
```

## ドキュメント

詳細な設計情報は `docs/` ディレクトリを参照。

| ドキュメント | 内容 |
|:--|:--|
| [要件定義書](./docs/requirements.md) | プロジェクト概要、機能要件、非機能要件、画面一覧 |
| [データベース設計書](./docs/database.md) | テーブル定義、RLS ポリシー、インデックス、トリガー |
| [機能設計書](./docs/specification.md) | アーキテクチャ、認証・認可、API 仕様、画面設計、コンポーネント設計 |
# web-skillup-service

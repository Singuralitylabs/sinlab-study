# Cloudflare Stream 動画のアップロードと設定手順

講座動画の配信先は Cloudflare Stream（署名付き再生）。仕様は `docs/specification.md` 3.2、経緯は Issue #488。この文書は、動画を 1 本追加・差し替えするときの運用手順だけを書く。

## 前提

- 環境変数 `CLOUDFLARE_STREAM_CUSTOMER_CODE` / `CLOUDFLARE_STREAM_SIGNING_KEY_ID` / `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` が、ローカル（`.env.local`）と Vercel（本番・プレビュー）に設定済み（一覧は `README.md`）。
- 動画ファイルは動画ツール（コンテンツリポジトリの `tools/video`）が出す 1080p の mp4。720p は不要（Stream が複数画質に変換する）。

## 1. アップロード

1. Cloudflare ダッシュボードの **Stream → Videos**（`https://dash.cloudflare.com/<アカウントID>/stream/videos`）を開く。
2. **Upload videos** で mp4 を選ぶ（ドラッグ&ドロップも可）。ダッシュボードのアップロードにはサイズ上限があるため、超える場合は Cloudflare の公式手順（tus による再開可能アップロード）に従う（上限値は要確認）。
3. 変換（Encoding）が完了して「Ready」になるまで待つ。
4. 動画名は管理しやすい名前に変える（例: `web-dev_01_html-kiso`。テーマのスラッグと回の番号をそろえる）。

## 2. 動画ごとの設定（本番用の動画）

動画の詳細画面で次を設定する。**設定漏れは「誰でも再生できる」状態になるので、必ず確認する。**

| 設定 | 値 |
|:--|:--|
| Require Signed URLs | **ON**（アプリが署名付きトークンを付けて再生する） |
| Allowed Origins | 本番のホスト名、プレビューのホスト名（`https://` なし・ポートなし。複数はカンマ区切りでスペースなし。例: `study.example.com,my-preview.vercel.app`） |
| Downloads | **OFF**（有効にしない） |

注意:
- Allowed Origins には IP アドレスを入れられない（Bad Request になる）。`localhost` を入れてもローカルで再生できなかった（2026-10-25 確認）ので、**ローカル確認用の動画を 1 本だけ別に用意し、その動画の Allowed Origins は空にする**。署名付きURLが必須のままなので、トークンのない人は再生できないが、他のサイトへの埋め込みは防げない。本番の会員向け動画には使わない。
- 本番用の動画をローカルで見たいときは、一時的に Allowed Origins を空にし、確認後に戻す。

## 3. 動画 ID を控える

動画の詳細画面の **Video ID**（32 桁の英数字）をコピーする。これが `video_url` に入れる値。

## 4. サイトへの登録

1. `/manage` で対象の動画コンテンツを開く（新規なら種別「動画」で作成）。
2. 「動画」欄に **YouTube URL ではなく Video ID（32 桁）** を入力して保存する。それ以外の外部 URL は保存時にエラーになる。
3. 本番かプレビューで該当ページを開き、再生ボタンを押して再生できることを確認する（会員、ロック済みのお試しユーザー、`/demo` のお試し公開動画でそれぞれ確認できるとよい）。
4. 確認できたら、移行元の YouTube 動画を非公開にする。
5. コンテンツリポジトリの各テーマ `README.md` の表に、Stream の Video ID を記録する（Issue #292）。

## 5. 費用の見張り

- 料金は保存（1,000 分ごとに月額）と配信（視聴分数に応じた従量課金）。Cloudflare の Billing で通知を設定し、月の配信分数を四半期ごとに確認する。
- 動画を差し替えたら、不要になった古い動画は Cloudflare から削除する（保存分の課金が続くため）。

## トラブルシュート

| 症状 | 原因と対処 |
|:--|:--|
| 「動画を読み込めませんでした」（サイト側） | サーバーのログ「Stream 再生トークンを発行できません: …」の理由を見る。環境変数の未設定・不正、`video_url` が 32 桁でない、鍵が PEM として読めない、のどれか。`.env.local` を直したら dev サーバーを再起動する |
| 再生ボタン後に「This video has not been configured to be allowed on this domain」 | その動画の Allowed Origins に、今開いているページのホスト名が入っていない（ローカルは上記の注意を参照） |
| 再生ボタンの後に何も出ない／認証エラー | 署名鍵の ID と PEM の組が合っていない、または鍵を作り直した（ローカルと Vercel の両方を更新） |

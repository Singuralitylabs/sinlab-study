import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// `/login` のサービス紹介ブロック（issue #264）をページ単位で検証する。
// クライアントのログインボタンは描画結果の検証に不要なため差し替える。

vi.mock("@/app/(auth)/login/components/google-login-button", () => ({
  GoogleLoginButton: () => createElement("div", { "data-testid": "google-login-button" }),
}));

import LoginPage from "@/app/(auth)/login/page";
import { LP_URL, TRIAL_EVENT_FORM_URL } from "@/app/constants/marketing";
import { DISPLAY_MONTHLY_PRICE_JPY } from "@/app/constants/stripe";

const render = async (error?: string) =>
  renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error }) }));

const expectedPrice = DISPLAY_MONTHLY_PRICE_JPY.toLocaleString("ja-JP");

describe("ログインページのサービス紹介（issue #264）", () => {
  it("キャッチコピー・サブコピーを表示する", async () => {
    const html = await render();

    expect(html).toContain("「続かない」を、仕組みで解決する");
    expect(html).toContain(
      "学習の地図、進捗の見える化、AIによる即時レビュー。一人でも挫折しないWeb技術の学習環境を、シンラボがお届けします。"
    );
  });

  it("4つの仕組みの見出しと一言を表示する", async () => {
    const html = await render();

    expect(html).toContain("学習の「地図」が手に入る");
    expect(html).toContain("全体ロードマップで道筋が見え、次のステップが自動で提示される");
    expect(html).toContain("進捗が「見える」から、やる気が続く");
    expect(html).toContain("ダッシュボードの進捗率・進捗バーで成長がビジュアルで見える");
    expect(html).toContain("動画 × テキスト × 演習で、理解を確実に定着させる");
    expect(html).toContain("「見るだけ」で終わらない、必ず手を動かす演習つき");
    expect(html).toContain("提出直後にAIが、あなたのコードをレビュー");
    expect(html).toContain("良い点と改善点をセットで即時フィードバック");
  });

  it("料金1行を定数から導出した金額で表示する", async () => {
    const html = await render();

    expect(html).toContain(`月額${expectedPrice}円（税込）`);
    expect(html).toContain("まずは無料で始められます。");
  });

  it("3リンクを表示し、外部リンクは別タブ・内部リンクは通常遷移にする", async () => {
    const html = await render();

    expect(html).toContain("サービス紹介を見る");
    expect(html).toContain(`href="${LP_URL}"`);
    expect(html).toContain("無料体験会に申込む");
    expect(html).toContain(`href="${TRIAL_EVENT_FORM_URL}"`);
    expect(html).toContain('href="/demo"');
    expect(html).toContain("デモを試す");

    const demoAnchor = html.match(/<a[^>]*href="\/demo"[^>]*>/)?.[0] ?? "";
    expect(demoAnchor).not.toContain('target="_blank"');

    expect(html).toContain(`href="${LP_URL}" target="_blank"`);
    expect(html).toContain(`href="${TRIAL_EVENT_FORM_URL}" target="_blank"`);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("error=registration_failed のとき登録失敗メッセージを表示する", async () => {
    const html = await render("registration_failed");

    expect(html).toContain("アカウント登録に失敗しました。");
  });

  it("error=terms_required のとき同意要求メッセージを表示する", async () => {
    const html = await render("terms_required");

    expect(html).toContain("利用規約およびプライバシーポリシーへの同意の確認ができませんでした。");
  });

  it("未知の error 値ではメッセージを表示しない", async () => {
    const html = await render("unknown_error");

    expect(html).not.toContain("アカウント登録に失敗しました。");
    expect(html).not.toContain(
      "利用規約およびプライバシーポリシーへの同意の確認ができませんでした。"
    );
  });

  it("既存のログイン導線（見出し・ボタン・お試し案内）を維持する", async () => {
    const html = await render();

    expect(html).toContain("Sinlab Study");
    expect(html).toContain("Googleアカウントでログインしてください");
    expect(html).toContain('data-testid="google-login-button"');
    expect(html).toContain(
      "ログイン後すぐに、お試し公開コンテンツの閲覧・課題提出をご利用いただけます。"
    );
  });
});

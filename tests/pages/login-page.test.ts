import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Noto_Sans_JP: () => ({ className: "font-noto-sans-jp", style: {} }),
}));
// The client component handling consent and OAuth start is replaced with a presence-check stub; its
// behavior is out of scope here.
vi.mock("@/app/(auth)/login/components/google-login-button", () => ({
  GoogleLoginButton: () => createElement("div", { "data-testid": "google-login-button" }),
}));

import LoginPage from "@/app/(auth)/login/page";
import { TERMS_REQUIRED_ERROR_CODE } from "@/app/constants/auth";
import { COMMERCIAL_TRANSACTIONS_URL } from "@/app/constants/legal";
import { FREE_TRIAL_FORM_URL, SERVICE_LP_URL } from "@/app/constants/marketing";
import { DISPLAY_MONTHLY_PRICE_JPY } from "@/app/constants/stripe";

const render = async (error?: string) =>
  renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error }) }));

const textOf = (html: string) => html.replace(/<[^>]+>/g, "");

const anchorTag = (html: string, href: string) => {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<a[^>]*href="${escaped}"[^>]*>`))?.[0];
};

const REGISTRATION_FAILED_MESSAGE = "アカウント登録に失敗しました。";
const TERMS_REQUIRED_MESSAGE =
  "利用規約およびプライバシーポリシーへの同意の確認ができませんでした。";

describe("LoginPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("キャッチコピー・サブコピーを表示する", async () => {
    const text = textOf(await render());

    expect(text).toContain("「続かない」を、仕組みで解決する");
    expect(text).toContain(
      "学習の地図、進捗の見える化、AIによる即時レビュー。一人でも挫折しないWeb技術の学習環境を、シンラボがお届けします。"
    );
  });

  it("4つの仕組みを見出しと一言で表示する", async () => {
    const text = textOf(await render());

    for (const [title, description] of [
      ["学習の「地図」が手に入る", "全体ロードマップで道筋が見え、次のステップが自動で提示される"],
      [
        "進捗が「見える」から、やる気が続く",
        "ダッシュボードの進捗率・進捗バーで成長がビジュアルで見える",
      ],
      [
        "動画 × テキスト × 演習で、理解を確実に定着させる",
        "「見るだけ」で終わらない、必ず手を動かす演習つき",
      ],
      ["提出直後にAIが、あなたのコードをレビュー", "良い点と改善点をセットで即時フィードバック"],
    ]) {
      expect(text).toContain(title);
      expect(text).toContain(description);
    }
  });

  it("決済機能が有効なときは料金を DISPLAY_MONTHLY_PRICE_JPY から導出した1行で表示する", async () => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    const text = textOf(await render());

    expect(text).toContain(
      `まずは無料で始められます。全コンテンツの利用は月額${DISPLAY_MONTHLY_PRICE_JPY.toLocaleString("ja-JP")}円（税込）。`
    );
  });

  it.each([undefined, "false"])(
    "決済機能が無効（STRIPE_ENABLED=%s）のときは月額料金の文言を出さない",
    async (value) => {
      vi.stubEnv("STRIPE_ENABLED", value);
      const text = textOf(await render());

      expect(text).toContain("まずは無料で始められます。");
      expect(text).not.toContain("月額");
      expect(text).not.toContain("全コンテンツの利用は");
    }
  );

  it("デモは内部リンク、LP・無料体験会フォームは別タブの外部リンクで表示する", async () => {
    const html = await render();

    const demo = anchorTag(html, "/demo");
    expect(demo).toBeDefined();
    expect(demo).not.toContain("target=");

    for (const href of [SERVICE_LP_URL, FREE_TRIAL_FORM_URL]) {
      const tag = anchorTag(html, href);
      expect(tag).toBeDefined();
      expect(tag).toContain('target="_blank"');
      expect(tag).toContain('rel="noopener noreferrer"');
    }

    const text = textOf(html);
    expect(text).toContain("デモを試す");
    expect(text).toContain("無料体験会に申込む");
    expect(text).toContain("サービス紹介を見る");
  });

  it("料金1行とリンクを4つの仕組みのカードより前に表示する", async () => {
    const text = textOf(await render());

    const firstFeature = text.indexOf("学習の「地図」が手に入る");
    expect(text.indexOf("まずは無料で始められます。")).toBeLessThan(firstFeature);
    expect(text.indexOf("デモを試す")).toBeLessThan(firstFeature);
    expect(text.indexOf("サービス紹介を見る")).toBeLessThan(firstFeature);
  });

  it("実際の学習画面として4枚の画面を表示する", async () => {
    const html = await render();

    expect(textOf(html)).toContain("実際の学習画面");
    for (const alt of [
      "動画コンテンツの画面",
      "スライドコンテンツの画面",
      "課題提出の画面",
      "AIレビュー結果の画面",
    ]) {
      expect(html).toContain(`alt="${alt}"`);
    }
  });

  it("ログインボタンと既存の案内・法務リンクを維持する", async () => {
    const html = await render();

    expect(html).toContain('data-testid="google-login-button"');
    expect(textOf(html)).toContain(
      "ログイン後すぐに、お試し公開コンテンツの閲覧・課題提出をご利用いただけます。"
    );
    expect(textOf(html)).toContain("特定商取引法に基づく表記");
    expect(anchorTag(html, COMMERCIAL_TRANSACTIONS_URL)).toBeDefined();
  });

  it("error=registration_failed で登録失敗メッセージを表示する", async () => {
    const text = textOf(await render("registration_failed"));

    expect(text).toContain(REGISTRATION_FAILED_MESSAGE);
    expect(text).not.toContain(TERMS_REQUIRED_MESSAGE);
  });

  it(`error=${TERMS_REQUIRED_ERROR_CODE} で同意要求メッセージを表示する`, async () => {
    const text = textOf(await render(TERMS_REQUIRED_ERROR_CODE));

    expect(text).toContain(TERMS_REQUIRED_MESSAGE);
    expect(text).not.toContain(REGISTRATION_FAILED_MESSAGE);
  });

  it.each([undefined, "unknown"])("error=%s ではエラーメッセージを表示しない", async (error) => {
    const text = textOf(await render(error));

    expect(text).not.toContain(REGISTRATION_FAILED_MESSAGE);
    expect(text).not.toContain(TERMS_REQUIRED_MESSAGE);
  });
});

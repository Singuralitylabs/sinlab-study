import { describe, expect, it } from "vitest";
import {
  buildApprovedEmail,
  buildAppUrl,
  buildCancelScheduledEmail,
  buildSignupEmail,
  buildSubscriptionEndedEmail,
  buildUpgradedEmail,
  renderEmailLayout,
} from "@/app/services/notifications/email-templates";

const APP_URL = "https://study.example.com";

describe("buildAppUrl", () => {
  it("NEXT_PUBLIC_APP_URL の末尾スラッシュ有無に関係なく絶対URLを作る", () => {
    expect(buildAppUrl("https://study.example.com", "/upgrade")).toBe(
      "https://study.example.com/upgrade"
    );
    expect(buildAppUrl("https://study.example.com/", "/upgrade")).toBe(
      "https://study.example.com/upgrade"
    );
  });
});

describe("renderEmailLayout", () => {
  const rendered = renderEmailLayout({
    subject: "件名",
    greetingName: "山田<script>",
    paragraphs: ["本文1", "本文2"],
    links: [{ label: "開く", url: "https://study.example.com/?a=1&b=2" }],
    extraFooterLines: ["配信停止はこちら"],
  });

  it("テキスト版に宛名・本文・リンク・フッター（送信元・返信不可）を含める", () => {
    expect(rendered.text).toContain("山田<script> 様");
    expect(rendered.text).toContain("本文1");
    expect(rendered.text).toContain("開く: https://study.example.com/?a=1&b=2");
    expect(rendered.text).toContain("自動送信");
    expect(rendered.text).toContain("返信いただいてもお答えできません");
    expect(rendered.text).toContain("配信停止はこちら");
  });

  it("HTML版は差し込み値をエスケープし、ヘッダー・本文・フッターで包む", () => {
    expect(rendered.html).toContain("山田&lt;script&gt; 様");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain('href="https://study.example.com/?a=1&amp;b=2"');
    expect(rendered.html).toContain("AIと学ぶ実践Web技術講座");
    expect(rendered.html).toContain("返信いただいてもお答えできません");
    expect(rendered.html).toContain("配信停止はこちら");
  });
});

describe("buildSignupEmail", () => {
  it("お試しでできること・最初の学習コンテンツへのリンク・本登録の案内を含める", () => {
    const email = buildSignupEmail({
      displayName: "山田",
      appUrl: APP_URL,
      upgradeAvailable: true,
    });

    expect(email.subject).toContain("ご登録ありがとうございます");
    expect(email.text).toContain("お試しユーザー");
    expect(email.text).toContain(`学習を始める: ${APP_URL}/learn`);
    expect(email.text).toContain("管理者による承認、またはプランのアップグレード");
    expect(email.text).toContain(`${APP_URL}/upgrade`);
    expect(email.html).toContain(`href="${APP_URL}/learn"`);
  });

  it("決済機能が無効なときはアップグレードを案内しない", () => {
    const email = buildSignupEmail({
      displayName: "山田",
      appUrl: APP_URL,
      upgradeAvailable: false,
    });

    expect(email.text).not.toContain("/upgrade");
    expect(email.text).not.toContain("アップグレード");
    expect(email.text).toContain("管理者による承認");
  });
});

describe("buildApprovedEmail", () => {
  it("本登録の完了・会員種別・ダッシュボードへのリンクを含める", () => {
    const email = buildApprovedEmail({
      displayName: "山田",
      appUrl: APP_URL,
      membershipLabel: "コミュニティ会員",
    });

    expect(email.subject).toContain("本登録が完了しました");
    expect(email.text).toContain("すべての学習コンテンツ");
    expect(email.text).toContain("会員種別: コミュニティ会員");
    expect(email.text).toContain(`ダッシュボードを開く: ${APP_URL}/`);
  });
});

describe("buildUpgradedEmail", () => {
  it("有料会員化・料金・次回請求日・お支払い管理への案内を含める", () => {
    const email = buildUpgradedEmail({
      displayName: "山田",
      appUrl: APP_URL,
      monthlyPriceLabel: "月額1,500円（税込）",
      nextBillingDateLabel: "2026/10/27",
    });

    expect(email.subject).toContain("一般有料会員");
    expect(email.text).toContain("料金: 月額1,500円（税込）");
    expect(email.text).toContain("次回のお支払い予定日: 2026/10/27");
    expect(email.text).toContain(`お支払い情報の管理: ${APP_URL}/upgrade`);
  });

  it("料金・次回請求日を取得できなければその行を載せない", () => {
    const email = buildUpgradedEmail({
      displayName: "山田",
      appUrl: APP_URL,
      monthlyPriceLabel: null,
      nextBillingDateLabel: null,
    });

    expect(email.text).not.toContain("料金:");
    expect(email.text).not.toContain("次回のお支払い予定日");
  });
});

describe("buildCancelScheduledEmail", () => {
  it("解約の受付・利用期限・Portal からの取り消し方法を含める", () => {
    const email = buildCancelScheduledEmail({
      displayName: "山田",
      appUrl: APP_URL,
      periodEndDateLabel: "2026/10/27",
    });

    expect(email.subject).toContain("解約");
    expect(email.text).toContain("2026/10/27 まで");
    expect(email.text).toContain("解約を取り消す");
    expect(email.text).toContain(`${APP_URL}/upgrade`);
  });

  it("利用期限を取得できなければ期間終了までと案内する", () => {
    const email = buildCancelScheduledEmail({
      displayName: "山田",
      appUrl: APP_URL,
      periodEndDateLabel: null,
    });

    expect(email.text).toContain("現在のお支払い期間の終了まで");
  });
});

describe("buildSubscriptionEndedEmail", () => {
  it("お試しへ戻ったこと・お試しコンテンツは使えること・再開方法を含める", () => {
    const email = buildSubscriptionEndedEmail({ displayName: "山田", appUrl: APP_URL });

    expect(email.subject).toContain("終了");
    expect(email.text).toContain("お試しユーザーに戻りました");
    expect(email.text).toContain("お試し公開の学習コンテンツは引き続き");
    expect(email.text).toContain(`アップグレードページを開く: ${APP_URL}/upgrade`);
  });
});

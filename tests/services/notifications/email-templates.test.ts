import { describe, expect, it } from "vitest";
import {
  buildApprovedEmail,
  buildAppUrl,
  buildCancelScheduledEmail,
  buildInactivityReminderEmail,
  buildSignupEmail,
  buildSubscriptionEndedEmail,
  buildTrialNurtureEmail,
  buildUpgradedEmail,
  buildWeeklyDigestEmail,
  renderEmailLayout,
  suggestWeeklyGoal,
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
  });

  it("テキスト版に宛名・本文・リンク・フッター（送信元・返信不可）を含める", () => {
    expect(rendered.text).toContain("山田<script> 様");
    expect(rendered.text).toContain("本文1");
    expect(rendered.text).toContain("開く: https://study.example.com/?a=1&b=2");
    expect(rendered.text).toContain("自動送信");
    expect(rendered.text).toContain("返信いただいてもお答えできません");
  });

  it("配信停止リンクを渡さない（トランザクションメール）ときは、配信停止の案内もヘッダーも付けない", () => {
    expect(rendered.text).not.toContain("配信を停止");
    expect(rendered.html).not.toContain("配信停止");
    expect(rendered.headers).toBeUndefined();
  });

  it("HTML版は差し込み値をエスケープし、ヘッダー・本文・フッターで包む", () => {
    expect(rendered.html).toContain("山田&lt;script&gt; 様");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain('href="https://study.example.com/?a=1&amp;b=2"');
    expect(rendered.html).toContain("AIと学ぶ実践Web技術講座");
    expect(rendered.html).toContain("返信いただいてもお答えできません");
  });

  it("配信停止リンクを渡すと、フッターのリンクとワンクリック配信停止のヘッダーを付ける", () => {
    const url = "https://study.example.com/api/email/unsubscribe?token=7.abc";
    const withUnsubscribe = renderEmailLayout({
      subject: "件名",
      greetingName: "山田",
      paragraphs: ["本文"],
      links: [],
      unsubscribeUrl: url,
    });

    expect(withUnsubscribe.text).toContain(`配信を停止できます: ${url}`);
    expect(withUnsubscribe.html).toContain(`href="${url}"`);
    expect(withUnsubscribe.headers).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
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

const UNSUBSCRIBE_URL = `${APP_URL}/api/email/unsubscribe?token=7.sig`;

describe("トランザクションメールには配信停止リンクを入れない", () => {
  it.each([
    buildSignupEmail({ displayName: "山田", appUrl: APP_URL, upgradeAvailable: true }),
    buildApprovedEmail({ displayName: "山田", appUrl: APP_URL, membershipLabel: "一般有料会員" }),
    buildSubscriptionEndedEmail({ displayName: "山田", appUrl: APP_URL }),
  ])("%#", (email) => {
    expect(email.text).not.toContain("/api/email/unsubscribe");
    expect(email.headers).toBeUndefined();
  });
});

describe("suggestWeeklyGoal", () => {
  it("先週の実績より1本多く、最低2本を目安にし、残り本数を超えない", () => {
    expect(suggestWeeklyGoal(0, 10)).toBe(2);
    expect(suggestWeeklyGoal(3, 10)).toBe(4);
    expect(suggestWeeklyGoal(3, 1)).toBe(1);
  });
});

describe("buildWeeklyDigestEmail", () => {
  it("先週の完了数・提出数、次に学ぶコンテンツへのリンク、今週の目標、配信停止リンクを含める", () => {
    const email = buildWeeklyDigestEmail({
      displayName: "山田",
      appUrl: APP_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      completedLastWeek: 3,
      submittedLastWeek: 1,
      nextContent: { title: "変数と型", path: "/learn/1/2/3/4" },
      remainingContents: 10,
    });

    expect(email.subject).toContain("今週の学習");
    expect(email.text).toContain("コンテンツ完了 3 本 / 演習の提出 1 件");
    expect(email.text).toContain("次に学ぶコンテンツ: 変数と型");
    expect(email.text).toContain("4 本完了");
    expect(email.text).toContain(`続きから学ぶ: ${APP_URL}/learn/1/2/3/4`);
    expect(email.text).toContain(UNSUBSCRIBE_URL);
    expect(email.headers?.["List-Unsubscribe"]).toBe(`<${UNSUBSCRIBE_URL}>`);
  });

  it("すべて完了しているときは次のコンテンツの代わりにダッシュボードへ誘導する", () => {
    const email = buildWeeklyDigestEmail({
      displayName: "山田",
      appUrl: APP_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      completedLastWeek: 2,
      submittedLastWeek: 0,
      nextContent: null,
      remainingContents: 0,
    });

    expect(email.text).toContain("すべて完了しています");
    expect(email.text).toContain(`ダッシュボードを開く: ${APP_URL}/`);
    expect(email.text).not.toContain("今週の目標");
  });
});

describe("buildInactivityReminderEmail", () => {
  it("最初の1本へのリンク・困ったときの連絡先・配信停止リンクを含める", () => {
    const email = buildInactivityReminderEmail({
      displayName: "山田",
      appUrl: APP_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      firstContent: { title: "はじめての自動化", path: "/learn/1/1/1/1" },
    });

    expect(email.text).toContain("まだ学習を始められていない");
    expect(email.text).toContain(`最初の1本を始める: ${APP_URL}/learn/1/1/1/1`);
    expect(email.text).toContain("お問い合わせください");
    expect(email.text).toContain(UNSUBSCRIBE_URL);
  });

  it("閲覧できるコンテンツが無いときは学習トップへ誘導する", () => {
    const email = buildInactivityReminderEmail({
      displayName: "山田",
      appUrl: APP_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      firstContent: null,
    });

    expect(email.text).toContain(`学習を始める: ${APP_URL}/learn`);
  });
});

describe("buildTrialNurtureEmail", () => {
  const base = {
    displayName: "山田",
    appUrl: APP_URL,
    unsubscribeUrl: UNSUBSCRIBE_URL,
    lockedThemeNames: ["GAS実践", "Web制作"],
  };

  it.each([2, 5, 7, 14] as const)("Day%i も配信停止リンクを含める", (day) => {
    const email = buildTrialNurtureEmail({ ...base, day, upgradeAvailable: true });
    expect(email.text).toContain(UNSUBSCRIBE_URL);
    expect(email.headers?.["List-Unsubscribe"]).toBe(`<${UNSUBSCRIBE_URL}>`);
  });

  it("Day2 は演習の提出、Day5 は AI レビューを案内する", () => {
    expect(buildTrialNurtureEmail({ ...base, day: 2, upgradeAvailable: true }).subject).toContain(
      "演習を出してみましょう"
    );
    expect(buildTrialNurtureEmail({ ...base, day: 5, upgradeAvailable: true }).text).toContain(
      "AI があなたのコードをレビュー"
    );
  });

  it("Day7 は鍵コンテンツで学べるテーマと、決済が有効ならアップグレードを案内する", () => {
    const email = buildTrialNurtureEmail({ ...base, day: 7, upgradeAvailable: true });

    expect(email.text).toContain("本登録で学べるテーマ: GAS実践、Web制作");
    expect(email.text).toContain(`プランのアップグレード: ${APP_URL}/upgrade`);
  });

  it.each([7, 14] as const)(
    "Day%i: isStripeEnabled() が false のときは /upgrade へ誘導せず承認だけを案内する",
    (day) => {
      const email = buildTrialNurtureEmail({ ...base, day, upgradeAvailable: false });

      expect(email.text).not.toContain("/upgrade");
      expect(email.html).not.toContain("/upgrade");
      expect(email.text).not.toContain("アップグレード");
      expect(email.text).toContain("管理者による承認");
    }
  );

  it("Day14 は最後の案内であることを伝える", () => {
    const email = buildTrialNurtureEmail({ ...base, day: 14, upgradeAvailable: true });
    expect(email.text).toContain("これが最後です");
  });
});

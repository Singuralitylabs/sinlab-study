import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_TEXTS,
  EMAIL_TEMPLATE_KEYS,
  type EmailTexts,
} from "@/app/lib/email-template";
import { renderEmailMarkdown } from "@/app/lib/markdown-email";
import {
  buildAnnouncementEmail,
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

  it.each([2, 5, 7, 14])("Day%i も配信停止リンクを含める", (day) => {
    const email = buildTrialNurtureEmail({
      ...base,
      day,
      isFinal: day === 14,
      upgradeAvailable: true,
    });
    expect(email.text).toContain(UNSUBSCRIBE_URL);
    expect(email.headers?.["List-Unsubscribe"]).toBe(`<${UNSUBSCRIBE_URL}>`);
  });

  it("Day2 は演習の提出、Day5 は AI レビューを案内する", () => {
    expect(
      buildTrialNurtureEmail({ ...base, day: 2, isFinal: false, upgradeAvailable: true }).subject
    ).toContain("演習を出してみましょう");
    expect(
      buildTrialNurtureEmail({ ...base, day: 5, isFinal: false, upgradeAvailable: true }).text
    ).toContain("AI があなたのコードをレビュー");
  });

  it("Day7 は鍵コンテンツで学べるテーマと、決済が有効ならアップグレードを案内する", () => {
    const email = buildTrialNurtureEmail({
      ...base,
      day: 7,
      isFinal: false,
      upgradeAvailable: true,
    });

    expect(email.text).toContain("本登録で学べるテーマ: GAS実践、Web制作");
    expect(email.text).toContain(`プランのアップグレード: ${APP_URL}/upgrade`);
  });

  it.each([7, 14])(
    "Day%i: isStripeEnabled() が false のときは /upgrade へ誘導せず承認だけを案内する",
    (day) => {
      const email = buildTrialNurtureEmail({
        ...base,
        day,
        isFinal: day === 14,
        upgradeAvailable: false,
      });

      expect(email.text).not.toContain("/upgrade");
      expect(email.html).not.toContain("/upgrade");
      expect(email.text).not.toContain("アップグレード");
      expect(email.text).toContain("管理者による承認");
    }
  );

  it("Day14 は最後の案内であることを伝える", () => {
    const email = buildTrialNurtureEmail({
      ...base,
      day: 14,
      isFinal: true,
      upgradeAvailable: true,
    });
    expect(email.text).toContain("これが最後です");
  });

  it("最後の設定日でなければ、最後の案内とは伝えない", () => {
    const email = buildTrialNurtureEmail({
      ...base,
      day: 14,
      isFinal: false,
      upgradeAvailable: true,
    });
    expect(email.text).not.toContain("これが最後です");
  });

  it.each([
    [1, "演習を出してみましょう"],
    [3, "演習を出してみましょう"],
    [6, "AI レビューを受けてみましょう"],
    [10, "本登録で学べる内容のご案内"],
    [30, "お試し期間のご案内"],
  ])("設定した日数 %i 日目は、直近の段階（2・5・7・14）の案内になる", (day, subject) => {
    const email = buildTrialNurtureEmail({
      ...base,
      day,
      isFinal: true,
      upgradeAvailable: true,
    });
    expect(email.subject).toContain(subject);
  });

  it("経過日数の表記は 7 の倍数なら週、それ以外は日で書く", () => {
    const text = (day: number) =>
      buildTrialNurtureEmail({ ...base, day, isFinal: true, upgradeAvailable: true }).text;
    expect(text(7)).toContain("ご登録から1週間が経ちました");
    expect(text(14)).toContain("ご登録から2週間が経ちました");
    expect(text(10)).toContain("ご登録から10日が経ちました");
  });
});

describe("編集できる文面（#286）", () => {
  const unsubscribeUrl = "https://study.example.com/api/email/unsubscribe?token=7.abc";
  const promotional = { displayName: "山田", appUrl: APP_URL, unsubscribeUrl };

  it("サービス名の既定値は Sinlab Study で、講座名は補足・フッターに出る", () => {
    const email = buildSignupEmail({
      displayName: "山田",
      appUrl: APP_URL,
      upgradeAvailable: false,
    });

    expect(email.subject).toBe("【Sinlab Study】ご登録ありがとうございます");
    expect(email.fromName).toBe("Sinlab Study");
    expect(email.text).toContain("「Sinlab Study」にご登録いただきありがとうございます。");
    expect(email.text).toContain(
      "「Sinlab Study（AIと学ぶ実践Web技術講座）」から自動送信しています。"
    );
    expect(email.html).toContain("AIと学ぶ実践Web技術講座");
  });

  it("サービス名・補足を変えると、差出人名・件名・見出し・フッターに反映され、補足を空にすると出ない", () => {
    const email = buildApprovedEmail(
      { displayName: "山田", appUrl: APP_URL, membershipLabel: "一般" },
      { ...DEFAULT_EMAIL_TEXTS, branding: { serviceName: "新サービス", serviceSubtitle: null } }
    );

    expect(email.subject).toBe("【新サービス】本登録が完了しました");
    expect(email.fromName).toBe("新サービス");
    expect(email.text).toContain("「新サービス」から自動送信しています。");
    expect(email.html).toContain(">新サービス</div>");
    expect(email.html).not.toContain("AIと学ぶ実践Web技術講座");
  });

  it("保存された件名・本文で送り、差し込み値は HTML でエスケープされ Markdown として解釈されない", () => {
    const email = buildApprovedEmail(
      {
        displayName: "<script>",
        appUrl: APP_URL,
        membershipLabel: "[x](https://evil.example.com)",
      },
      {
        ...DEFAULT_EMAIL_TEXTS,
        templates: {
          approved: {
            subject: "承認: {{display_name}}",
            body: "**{{display_name}}** さん\n\n会員種別: {{membership_label}}",
          },
        },
      }
    );

    expect(email.subject).toBe("【Sinlab Study】承認: <script>");
    expect(email.html).toContain("<strong>&lt;script&gt;</strong>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain('href="https://evil.example.com"');
    expect(email.text).toContain("会員種別: [x](https://evil.example.com)");
  });

  it("件名に改行を含む値を差し込んでも、件名は1行になる", () => {
    const email = buildAnnouncementEmail({
      ...promotional,
      announcementId: 1,
      title: "件名\r\nBcc: evil@example.com",
      body: renderEmailMarkdown("本文"),
    });

    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("値が無い行は出さない（料金・日付を取得できないとき）", () => {
    const email = buildUpgradedEmail({
      displayName: "山田",
      appUrl: APP_URL,
      monthlyPriceLabel: null,
      nextBillingDateLabel: null,
    });

    expect(email.text).not.toContain("料金:");
    expect(email.text).not.toContain("次回のお支払い予定日");
    expect(email.html).not.toContain("料金:");
  });

  it.each([
    [
      "週次進捗",
      (texts: EmailTexts) =>
        buildWeeklyDigestEmail(
          {
            ...promotional,
            completedLastWeek: 0,
            submittedLastWeek: 0,
            nextContent: null,
            remainingContents: 0,
          },
          texts
        ),
    ],
    [
      "未学習リマインド",
      (texts: EmailTexts) =>
        buildInactivityReminderEmail({ ...promotional, firstContent: null }, texts),
    ],
    [
      "お試し 7日目",
      (texts: EmailTexts) =>
        buildTrialNurtureEmail(
          { ...promotional, day: 7, isFinal: false, upgradeAvailable: true, lockedThemeNames: [] },
          texts
        ),
    ],
    [
      "お知らせ",
      (texts: EmailTexts) =>
        buildAnnouncementEmail(
          { ...promotional, announcementId: 1, title: "t", body: renderEmailMarkdown("本文") },
          texts
        ),
    ],
  ])(
    "案内系（%s）は、本文を短い文面に書き換えても配信停止リンクと List-Unsubscribe を必ず付ける",
    (_name, build) => {
      const minimal = (body: string): EmailTexts => ({
        ...DEFAULT_EMAIL_TEXTS,
        templates: Object.fromEntries(
          EMAIL_TEMPLATE_KEYS.map((k) => [
            k,
            { subject: "件名", body: k === "announcement" ? "{{announcement_body}}" : body },
          ])
        ) as EmailTexts["templates"],
      });
      const email = build(minimal("短い本文"));

      expect(email.text).toContain(`配信を停止できます: ${unsubscribeUrl}`);
      expect(email.html).toContain(`href="${unsubscribeUrl}"`);
      expect(email.headers).toEqual({
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      });
      expect(email.text).toContain("自動送信しています");
      expect(email.text).toContain("返信いただいてもお答えできません");
    }
  );

  it("トランザクションメールは、どの文面でも配信停止リンクを付けない", () => {
    const email = buildSubscriptionEndedEmail(
      { displayName: "山田", appUrl: APP_URL },
      {
        ...DEFAULT_EMAIL_TEXTS,
        templates: { subscription_ended: { subject: "件名", body: "配信を停止できます" } },
      }
    );

    expect(email.headers).toBeUndefined();
    expect(email.text).not.toContain("api/email/unsubscribe");
  });

  it("お試し 14日目: 最後の案内のときだけ「これが最後です」が入り、経過日数の表記はコードが決める", () => {
    const base = { ...promotional, upgradeAvailable: true, lockedThemeNames: [] };
    const final = buildTrialNurtureEmail({ ...base, day: 14, isFinal: true });
    const notFinal = buildTrialNurtureEmail({ ...base, day: 20, isFinal: false });

    expect(final.text).toContain(
      "ご登録から2週間が経ちました。お試しユーザーへのご案内メールはこれが最後です。"
    );
    expect(notFinal.text).toContain("ご登録から20日が経ちました。");
    expect(notFinal.text).not.toContain("これが最後です");
  });

  it("お知らせ: 前後の定型文の間にお知らせ本文が入り、本文中のリンクは http(s) のみ", () => {
    const email = buildAnnouncementEmail({
      ...promotional,
      announcementId: 5,
      title: "タイトル",
      body: renderEmailMarkdown("[a](https://example.com) [b](javascript:alert(1))"),
    });

    expect(email.subject).toBe("【Sinlab Study】お知らせ: タイトル");
    expect(email.text).toContain("運営からのお知らせです。\n\n■ タイトル\n\n");
    expect(email.html).toContain('href="https://example.com"');
    expect(email.html).not.toContain('href="javascript:');
  });
});

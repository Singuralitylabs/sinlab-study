import { EMAIL_SERVICE_NAME, type TrialNurtureDay } from "@/app/constants/notifications";
import type { EmailContent } from "@/app/services/notifications/email";

type EmailLink = { label: string; url: string };

type EmailLayoutParams = {
  subject: string;
  greetingName: string;
  paragraphs: string[];
  /** 本文の末尾に置く導線ボタン（テキスト版では「ラベル: URL」の行になる） */
  links: EmailLink[];
  /**
   * 配信停止リンク。案内系メール（`PROMOTIONAL_EMAIL_KINDS`）では必ず渡し、トランザクション
   * メールでは渡さない。渡すとフッターにリンクを入れ、`List-Unsubscribe` ヘッダーも付ける
   */
  unsubscribeUrl?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** `NEXT_PUBLIC_APP_URL` の末尾スラッシュ有無に関係なく、アプリ内パスの絶対URLを作る */
export function buildAppUrl(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, "")}${path}`;
}

function footerLines(): string[] {
  return [
    `このメールは「${EMAIL_SERVICE_NAME}」から自動送信しています。`,
    "送信専用アドレスのため、このメールに返信いただいてもお答えできません。",
  ];
}

const UNSUBSCRIBE_LEAD =
  "学習状況のお知らせなどの案内メールが不要な場合は、こちらから配信を停止できます";

/** ヘッダー・本文・フッターの共通レイアウトで、テキスト版と HTML 版を同じ内容から組み立てる */
export function renderEmailLayout(params: EmailLayoutParams): EmailContent {
  const greeting = `${params.greetingName} 様`;
  const footer = footerLines();
  const { unsubscribeUrl } = params;

  const text = [
    greeting,
    "",
    ...params.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...params.links.map((link) => `${link.label}: ${link.url}`),
    "",
    "――――――――――",
    EMAIL_SERVICE_NAME,
    ...footer,
    ...(unsubscribeUrl ? [`${UNSUBSCRIBE_LEAD}: ${unsubscribeUrl}`] : []),
  ].join("\n");

  const linksHtml = params.links
    .map(
      (link) =>
        `<p style="margin:16px 0;"><a href="${escapeHtml(link.url)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(link.label)}</a></p>`
    )
    .join("");

  const html = [
    "<!DOCTYPE html>",
    '<html lang="ja"><head><meta charset="utf-8">',
    `<title>${escapeHtml(params.subject)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif;color:#18181b;">',
    '<div style="max-width:560px;margin:0 auto;padding:24px;">',
    `<div style="padding:12px 0;font-weight:bold;font-size:16px;">${escapeHtml(EMAIL_SERVICE_NAME)}</div>`,
    '<div style="background:#ffffff;border-radius:8px;padding:24px;line-height:1.7;font-size:14px;">',
    `<p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>`,
    ...params.paragraphs.map(
      (paragraph) => `<p style="margin:0 0 16px;">${escapeHtml(paragraph)}</p>`
    ),
    linksHtml,
    "</div>",
    '<div style="padding:16px 0;font-size:12px;color:#71717a;line-height:1.6;">',
    ...footer.map((line) => `<p style="margin:0;">${escapeHtml(line)}</p>`),
    ...(unsubscribeUrl
      ? [
          `<p style="margin:8px 0 0;">${escapeHtml(UNSUBSCRIBE_LEAD)}: <a href="${escapeHtml(unsubscribeUrl)}" style="color:#71717a;">配信停止</a></p>`,
        ]
      : []),
    "</div>",
    "</div></body></html>",
  ].join("");

  if (!unsubscribeUrl) {
    return { subject: params.subject, text, html };
  }
  // RFC 8058 のワンクリック配信停止（対応クライアントは同じ URL へ POST する）
  return {
    subject: params.subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

function subjectOf(title: string): string {
  return `【${EMAIL_SERVICE_NAME}】${title}`;
}

export type SignupEmailParams = {
  displayName: string;
  appUrl: string;
  /** Stripe 決済が有効なとき、本登録の手段としてアップグレード（`/upgrade`）も案内する */
  upgradeAvailable: boolean;
};

export function buildSignupEmail(params: SignupEmailParams): EmailContent {
  const registrationGuide = params.upgradeAvailable
    ? "すべてのコンテンツをご利用いただくには本登録が必要です。本登録は管理者による承認、またはプランのアップグレードで行えます。"
    : "すべてのコンテンツをご利用いただくには本登録が必要です。本登録は管理者による承認で行います。承認が完了するとメールでお知らせします。";

  return renderEmailLayout({
    subject: subjectOf("ご登録ありがとうございます"),
    greetingName: params.displayName,
    paragraphs: [
      `「${EMAIL_SERVICE_NAME}」にご登録いただきありがとうございます。`,
      "現在はお試しユーザーとして、お試し公開の学習コンテンツを閲覧し、演習課題を提出できます。まずは最初の学習コンテンツから始めてみましょう。",
      registrationGuide,
    ],
    links: [
      { label: "学習を始める", url: buildAppUrl(params.appUrl, "/learn") },
      ...(params.upgradeAvailable
        ? [{ label: "プランのアップグレード", url: buildAppUrl(params.appUrl, "/upgrade") }]
        : []),
    ],
  });
}

export type ApprovedEmailParams = {
  displayName: string;
  appUrl: string;
  membershipLabel: string;
};

export function buildApprovedEmail(params: ApprovedEmailParams): EmailContent {
  return renderEmailLayout({
    subject: subjectOf("本登録が完了しました"),
    greetingName: params.displayName,
    paragraphs: [
      "管理者による承認が完了し、本登録が完了しました。すべての学習コンテンツをご利用いただけます。",
      `会員種別: ${params.membershipLabel}`,
    ],
    links: [{ label: "ダッシュボードを開く", url: buildAppUrl(params.appUrl, "/") }],
  });
}

export type UpgradedEmailParams = {
  displayName: string;
  appUrl: string;
  /** Stripe から取得した実請求額（JPY）。取得できなければ null（料金の行を載せない） */
  monthlyPriceLabel: string | null;
  /** 次回請求日の表示文字列。取得できなければ null */
  nextBillingDateLabel: string | null;
};

export function buildUpgradedEmail(params: UpgradedEmailParams): EmailContent {
  return renderEmailLayout({
    subject: subjectOf("一般有料会員へのご登録が完了しました"),
    greetingName: params.displayName,
    paragraphs: [
      "お支払いを確認し、一般有料会員へのご登録が完了しました。すべての学習コンテンツをご利用いただけます。",
      ...(params.monthlyPriceLabel ? [`料金: ${params.monthlyPriceLabel}`] : []),
      ...(params.nextBillingDateLabel
        ? [`次回のお支払い予定日: ${params.nextBillingDateLabel}`]
        : []),
      "お支払い方法の変更や解約は、アップグレードページの「お支払い情報の管理・解約」から行えます。",
    ],
    links: [
      { label: "ダッシュボードを開く", url: buildAppUrl(params.appUrl, "/") },
      { label: "お支払い情報の管理", url: buildAppUrl(params.appUrl, "/upgrade") },
    ],
  });
}

export type CancelScheduledEmailParams = {
  displayName: string;
  appUrl: string;
  /** 利用期限（`current_period_end`）の表示文字列。取得できなければ null */
  periodEndDateLabel: string | null;
};

export function buildCancelScheduledEmail(params: CancelScheduledEmailParams): EmailContent {
  const periodSentence = params.periodEndDateLabel
    ? `${params.periodEndDateLabel} まで、引き続きすべての学習コンテンツをご利用いただけます。`
    : "現在のお支払い期間の終了まで、引き続きすべての学習コンテンツをご利用いただけます。";

  return renderEmailLayout({
    subject: subjectOf("解約のお手続きを受け付けました"),
    greetingName: params.displayName,
    paragraphs: [
      "一般有料会員の解約のお手続きを受け付けました。",
      periodSentence,
      "期限までは、アップグレードページの「お支払い情報の管理・解約」から解約を取り消すことができます。",
    ],
    links: [{ label: "お支払い情報の管理", url: buildAppUrl(params.appUrl, "/upgrade") }],
  });
}

export type SubscriptionEndedEmailParams = {
  displayName: string;
  appUrl: string;
};

export function buildSubscriptionEndedEmail(params: SubscriptionEndedEmailParams): EmailContent {
  return renderEmailLayout({
    subject: subjectOf("一般有料会員の期間が終了しました"),
    greetingName: params.displayName,
    paragraphs: [
      "一般有料会員の期間が終了し、お試しユーザーに戻りました。",
      "お試し公開の学習コンテンツは引き続きご利用いただけます。",
      "一般有料会員は、アップグレードページからいつでも再開できます。",
    ],
    links: [{ label: "アップグレードページを開く", url: buildAppUrl(params.appUrl, "/upgrade") }],
  });
}

/** 案内系メール本文に載せる学習コンテンツ（パスはアプリ内の絶対パス `/learn/...`） */
export type EmailContentLink = { title: string; path: string };

type PromotionalEmailParams = {
  displayName: string;
  appUrl: string;
  /** 配信停止リンク（案内系メールでは必須） */
  unsubscribeUrl: string;
};

/** 困ったときの連絡先（送信元は返信不可のため、問い合わせ先を本文で案内する） */
const SUPPORT_GUIDE =
  "学習の進め方で困ったときは、ダッシュボードの「はじめかた」を確認するか、講座の運営（管理者）までお問い合わせください。";

/**
 * 今週の目標の提案（完了するコンテンツ数）。先週の実績より1本多く、最低2本を目安にし、
 * 残りのコンテンツ数を超えない
 */
export function suggestWeeklyGoal(completedLastWeek: number, remainingContents: number): number {
  return Math.min(remainingContents, Math.max(2, completedLastWeek + 1));
}

export type WeeklyDigestEmailParams = PromotionalEmailParams & {
  completedLastWeek: number;
  submittedLastWeek: number;
  /** 次に学ぶコンテンツ（未完了の先頭）。すべて完了していれば null */
  nextContent: EmailContentLink | null;
  /** 閲覧できる未完了コンテンツの数 */
  remainingContents: number;
};

export function buildWeeklyDigestEmail(params: WeeklyDigestEmailParams): EmailContent {
  const summary = `先週の学習: コンテンツ完了 ${params.completedLastWeek} 本 / 演習の提出 ${params.submittedLastWeek} 件`;
  const cheer =
    params.completedLastWeek > 0 || params.submittedLastWeek > 0
      ? "先週もお疲れさまでした。この調子で続けていきましょう。"
      : "先週は学習の記録がありませんでした。まずは1本、短い時間から再開してみましょう。";

  const goalParagraphs = params.nextContent
    ? [
        `次に学ぶコンテンツ: ${params.nextContent.title}`,
        `今週の目標の提案: コンテンツを ${suggestWeeklyGoal(params.completedLastWeek, params.remainingContents)} 本完了させてみましょう（残り ${params.remainingContents} 本）。`,
      ]
    : [
        "公開中の学習コンテンツはすべて完了しています。演習の見直しや、AI レビューを参考にした改善に取り組んでみましょう。",
      ];

  return renderEmailLayout({
    subject: subjectOf("今週の学習のお知らせ"),
    greetingName: params.displayName,
    paragraphs: [summary, cheer, ...goalParagraphs],
    links: params.nextContent
      ? [{ label: "続きから学ぶ", url: buildAppUrl(params.appUrl, params.nextContent.path) }]
      : [{ label: "ダッシュボードを開く", url: buildAppUrl(params.appUrl, "/") }],
    unsubscribeUrl: params.unsubscribeUrl,
  });
}

export type InactivityReminderEmailParams = PromotionalEmailParams & {
  /** 最初に学ぶコンテンツ（閲覧できる先頭）。無ければ学習トップへ誘導する */
  firstContent: EmailContentLink | null;
};

export function buildInactivityReminderEmail(params: InactivityReminderEmailParams): EmailContent {
  return renderEmailLayout({
    subject: subjectOf("最初の1本から始めてみませんか"),
    greetingName: params.displayName,
    paragraphs: [
      "ご登録ありがとうございます。まだ学習を始められていないようでしたので、ご案内をお送りしました。",
      params.firstContent
        ? `最初の1本「${params.firstContent.title}」は短い時間で取り組めます。まずはここから始めてみましょう。`
        : "学習コンテンツの一覧から、最初の1本を選んで始めてみましょう。",
      SUPPORT_GUIDE,
    ],
    links: [
      params.firstContent
        ? { label: "最初の1本を始める", url: buildAppUrl(params.appUrl, params.firstContent.path) }
        : { label: "学習を始める", url: buildAppUrl(params.appUrl, "/learn") },
    ],
    unsubscribeUrl: params.unsubscribeUrl,
  });
}

export type TrialNurtureEmailParams = PromotionalEmailParams & {
  day: TrialNurtureDay;
  /** Stripe 決済が有効なとき（`isStripeEnabled()`）だけアップグレード（`/upgrade`）へ誘導する */
  upgradeAvailable: boolean;
  /** 本登録で閲覧できるようになるコンテンツを含むテーマ名（Day7 の案内に使う） */
  lockedThemeNames: string[];
};

function registrationSentence(upgradeAvailable: boolean): string {
  return upgradeAvailable
    ? "すべてのコンテンツは、プランのアップグレード、または管理者による承認（本登録）でご利用いただけます。"
    : "すべてのコンテンツは、管理者による承認（本登録）でご利用いただけます。承認が完了するとメールでお知らせします。";
}

function registrationLinks(appUrl: string, upgradeAvailable: boolean): EmailLink[] {
  return upgradeAvailable
    ? [{ label: "プランのアップグレード", url: buildAppUrl(appUrl, "/upgrade") }]
    : [{ label: "ダッシュボードを開く", url: buildAppUrl(appUrl, "/") }];
}

export function buildTrialNurtureEmail(params: TrialNurtureEmailParams): EmailContent {
  const learnLink = { label: "学習コンテンツを開く", url: buildAppUrl(params.appUrl, "/learn") };

  switch (params.day) {
    case 2:
      return renderEmailLayout({
        subject: subjectOf("演習を出してみましょう"),
        greetingName: params.displayName,
        paragraphs: [
          "お試し期間でも、お試し公開の演習課題を提出できます。",
          "手を動かして書いたコードを提出すると、学んだ内容がしっかり身につきます。まずは1つ、演習を提出してみましょう。",
        ],
        links: [learnLink],
        unsubscribeUrl: params.unsubscribeUrl,
      });
    case 5:
      return renderEmailLayout({
        subject: subjectOf("AI レビューを受けてみましょう"),
        greetingName: params.displayName,
        paragraphs: [
          "演習を提出すると、AI があなたのコードをレビューし、良い点と改善点を返します。",
          "レビューを参考に書き直して再提出すると、理解がさらに深まります。提出した演習の画面から AI レビューを試してみましょう。",
        ],
        links: [learnLink],
        unsubscribeUrl: params.unsubscribeUrl,
      });
    case 7: {
      const themes = params.lockedThemeNames.slice(0, 5);
      return renderEmailLayout({
        subject: subjectOf("本登録で学べる内容のご案内"),
        greetingName: params.displayName,
        paragraphs: [
          "ご登録から1週間が経ちました。学習一覧で鍵のマークが付いているコンテンツは、本登録後にご利用いただけます。",
          ...(themes.length > 0 ? [`本登録で学べるテーマ: ${themes.join("、")}`] : []),
          registrationSentence(params.upgradeAvailable),
        ],
        links: registrationLinks(params.appUrl, params.upgradeAvailable),
        unsubscribeUrl: params.unsubscribeUrl,
      });
    }
    case 14:
      return renderEmailLayout({
        subject: subjectOf("お試し期間のご案内"),
        greetingName: params.displayName,
        paragraphs: [
          "ご登録から2週間が経ちました。お試しユーザーへのご案内メールはこれが最後です。",
          "お試し公開のコンテンツは引き続きご利用いただけます。",
          registrationSentence(params.upgradeAvailable),
        ],
        links: registrationLinks(params.appUrl, params.upgradeAvailable),
        unsubscribeUrl: params.unsubscribeUrl,
      });
  }
}

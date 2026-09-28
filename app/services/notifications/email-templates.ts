import { EMAIL_SERVICE_NAME } from "@/app/constants/notifications";
import type { EmailContent } from "@/app/services/notifications/email";

type EmailLink = { label: string; url: string };

type EmailLayoutParams = {
  subject: string;
  greetingName: string;
  paragraphs: string[];
  /** 本文の末尾に置く導線ボタン（テキスト版では「ラベル: URL」の行になる） */
  links: EmailLink[];
  /**
   * フッターに追加する行（Phase 2 の配信停止リンクなど）。サービス名・返信不可の案内は
   * 常に入るため、ここには種別固有の行だけを渡す
   */
  extraFooterLines?: string[];
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

function footerLines(extra: string[] = []): string[] {
  return [
    `このメールは「${EMAIL_SERVICE_NAME}」から自動送信しています。`,
    "送信専用アドレスのため、このメールに返信いただいてもお答えできません。",
    ...extra,
  ];
}

/** ヘッダー・本文・フッターの共通レイアウトで、テキスト版と HTML 版を同じ内容から組み立てる */
export function renderEmailLayout(params: EmailLayoutParams): EmailContent {
  const greeting = `${params.greetingName} 様`;
  const footer = footerLines(params.extraFooterLines);

  const text = [
    greeting,
    "",
    ...params.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...params.links.map((link) => `${link.label}: ${link.url}`),
    "",
    "――――――――――",
    EMAIL_SERVICE_NAME,
    ...footer,
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
    "</div>",
    "</div></body></html>",
  ].join("");

  return { subject: params.subject, text, html };
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

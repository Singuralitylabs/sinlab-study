import {
  DEFAULT_EMAIL_TEXTS,
  type EmailBranding,
  type EmailTemplateKey,
  type EmailTemplateValues,
  type EmailTexts,
  renderEmailBody,
  renderEmailSubject,
  resolveEmailTemplateText,
  sanitizeEmailValue,
} from "@/app/lib/email-template";
import { escapeHtml } from "@/app/lib/escape-html";
import type { EmailMarkdown } from "@/app/lib/markdown-email";
import type { EmailContent } from "@/app/services/notifications/email";

type EmailLink = { label: string; url: string };

type EmailLayoutParams = {
  subject: string;
  greetingName: string;
  paragraphs?: string[];
  /**
   * Body placed after the paragraphs (templated text). Only accepts values already converted with
   * `renderEmailMarkdown()` / `renderEmailBody()` (the HTML version escapes the whole text before
   * converting, so raw HTML in the body is not rendered).
   */
  markdownBody?: EmailMarkdown;
  /** Call-to-action buttons at the end (text version renders "label: URL" lines). */
  links: EmailLink[];
  /**
   * Unsubscribe link. Always pass it for promotional emails (`PROMOTIONAL_EMAIL_KINDS`), never
   * for transactional ones. When passed it adds a footer link and the `List-Unsubscribe` header.
   * Not part of the editable text, so no template edit can remove it.
   */
  unsubscribeUrl?: string;
  /** Sender / header / footer name; defaults to the code defaults. */
  branding?: EmailBranding;
};

/** Builds an absolute in-app URL regardless of a trailing slash in `NEXT_PUBLIC_APP_URL`. */
export function buildAppUrl(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, "")}${path}`;
}

function brandLabel(branding: EmailBranding): string {
  return branding.serviceSubtitle
    ? `${branding.serviceName}（${branding.serviceSubtitle}）`
    : branding.serviceName;
}

// Fixed wording (never editable): automatic-sending and no-reply notices.
function footerLines(branding: EmailBranding): string[] {
  return [
    `このメールは「${brandLabel(branding)}」から自動送信しています。`,
    "送信専用アドレスのため、このメールに返信いただいてもお答えできません。",
  ];
}

const UNSUBSCRIBE_LEAD =
  "学習状況のお知らせなどの案内メールが不要な場合は、こちらから配信を停止できます";

export function renderEmailLayout(params: EmailLayoutParams): EmailContent {
  const branding = params.branding ?? DEFAULT_EMAIL_TEXTS.branding;
  const greeting = `${params.greetingName} 様`;
  const footer = footerLines(branding);
  const paragraphs = params.paragraphs ?? [];
  const { unsubscribeUrl } = params;

  const text = [
    greeting,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(params.markdownBody ? [params.markdownBody.text, ""] : []),
    ...params.links.map((link) => `${link.label}: ${link.url}`),
    "",
    "――――――――――",
    branding.serviceName,
    ...(branding.serviceSubtitle ? [branding.serviceSubtitle] : []),
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
    `<div style="padding:12px 0;"><div style="font-weight:bold;font-size:16px;">${escapeHtml(branding.serviceName)}</div>${
      branding.serviceSubtitle
        ? `<div style="font-size:12px;color:#71717a;">${escapeHtml(branding.serviceSubtitle)}</div>`
        : ""
    }</div>`,
    '<div style="background:#ffffff;border-radius:8px;padding:24px;line-height:1.7;font-size:14px;">',
    `<p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>`,
    ...paragraphs.map((paragraph) => `<p style="margin:0 0 16px;">${escapeHtml(paragraph)}</p>`),
    ...(params.markdownBody ? [params.markdownBody.html] : []),
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

  const base = { subject: params.subject, text, html, fromName: branding.serviceName };
  if (!unsubscribeUrl) {
    return base;
  }
  // RFC 8058 one-click unsubscribe (supporting clients POST to the same URL).
  return {
    ...base,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

type TemplatedEmailParams = {
  key: EmailTemplateKey;
  texts: EmailTexts;
  displayName: string;
  values: EmailTemplateValues;
  links: EmailLink[];
  unsubscribeUrl?: string;
  announcementBody?: EmailMarkdown;
};

/**
 * Renders one templated email. Subject prefix, greeting, buttons, the automatic-sending notice and
 * the unsubscribe link/header are added here in code, so editing a template cannot remove them.
 */
function renderTemplatedEmail(params: TemplatedEmailParams): EmailContent {
  const { branding } = params.texts;
  const text = resolveEmailTemplateText(params.key, params.texts);
  const values: EmailTemplateValues = {
    display_name: params.displayName,
    service_name: branding.serviceName,
    ...params.values,
  };
  return renderEmailLayout({
    subject: subjectOf(branding, renderEmailSubject(text.subject, values)),
    greetingName: params.displayName,
    markdownBody: renderEmailBody(text.body, values, params.announcementBody),
    links: params.links,
    unsubscribeUrl: params.unsubscribeUrl,
    branding,
  });
}

function subjectOf(branding: EmailBranding, title: string): string {
  return `【${sanitizeEmailValue(branding.serviceName)}】${title}`;
}

export type SignupEmailParams = {
  displayName: string;
  appUrl: string;
  /**
   * When Stripe payments are enabled, also point to upgrade (`/upgrade`) as a way to fully
   * register.
   */
  upgradeAvailable: boolean;
};

export function buildSignupEmail(
  params: SignupEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  const registrationGuide = params.upgradeAvailable
    ? "すべてのコンテンツをご利用いただくには本登録が必要です。本登録は管理者による承認、またはプランのアップグレードで行えます。"
    : "すべてのコンテンツをご利用いただくには本登録が必要です。本登録は管理者による承認で行います。承認が完了するとメールでお知らせします。";

  return renderTemplatedEmail({
    key: "signup",
    texts,
    displayName: params.displayName,
    values: { registration_guide: registrationGuide },
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

export function buildApprovedEmail(
  params: ApprovedEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  return renderTemplatedEmail({
    key: "approved",
    texts,
    displayName: params.displayName,
    values: { membership_label: params.membershipLabel },
    links: [{ label: "ダッシュボードを開く", url: buildAppUrl(params.appUrl, "/") }],
  });
}

export type UpgradedEmailParams = {
  displayName: string;
  appUrl: string;
  /** Actual charged amount (JPY) from Stripe; null if unavailable (price line omitted). */
  monthlyPriceLabel: string | null;
  /** Display string of the next billing date; null if unavailable. */
  nextBillingDateLabel: string | null;
};

export function buildUpgradedEmail(
  params: UpgradedEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  return renderTemplatedEmail({
    key: "upgraded",
    texts,
    displayName: params.displayName,
    values: {
      monthly_price: params.monthlyPriceLabel ?? "",
      next_billing_date: params.nextBillingDateLabel ?? "",
    },
    links: [
      { label: "ダッシュボードを開く", url: buildAppUrl(params.appUrl, "/") },
      { label: "お支払い情報の管理", url: buildAppUrl(params.appUrl, "/upgrade") },
    ],
  });
}

export type CancelScheduledEmailParams = {
  displayName: string;
  appUrl: string;
  /** Display string of the access end date (`current_period_end`); null if unavailable. */
  periodEndDateLabel: string | null;
};

export function buildCancelScheduledEmail(
  params: CancelScheduledEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  return renderTemplatedEmail({
    key: "cancel_scheduled",
    texts,
    displayName: params.displayName,
    values: {
      access_until: params.periodEndDateLabel
        ? `${params.periodEndDateLabel} まで`
        : "現在のお支払い期間の終了まで",
    },
    links: [{ label: "お支払い情報の管理", url: buildAppUrl(params.appUrl, "/upgrade") }],
  });
}

export type SubscriptionEndedEmailParams = {
  displayName: string;
  appUrl: string;
};

export function buildSubscriptionEndedEmail(
  params: SubscriptionEndedEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  return renderTemplatedEmail({
    key: "subscription_ended",
    texts,
    displayName: params.displayName,
    values: {},
    links: [{ label: "アップグレードページを開く", url: buildAppUrl(params.appUrl, "/upgrade") }],
  });
}

/** Learning content in promotional email bodies (path is the in-app absolute path `/learn/...`). */
export type EmailContentLink = { title: string; path: string };

type PromotionalEmailParams = {
  displayName: string;
  appUrl: string;
  /** Unsubscribe link (required for promotional emails). */
  unsubscribeUrl: string;
};

/**
 * Suggested weekly goal (number of contents): one more than last week's result, at least 2,
 * capped at the remaining contents.
 */
export function suggestWeeklyGoal(completedLastWeek: number, remainingContents: number): number {
  return Math.min(remainingContents, Math.max(2, completedLastWeek + 1));
}

export type WeeklyDigestEmailParams = PromotionalEmailParams & {
  completedLastWeek: number;
  submittedLastWeek: number;
  /** Next content to learn (first incomplete); null if all are complete. */
  nextContent: EmailContentLink | null;
  /** Number of viewable incomplete contents. */
  remainingContents: number;
};

export function buildWeeklyDigestEmail(
  params: WeeklyDigestEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  const cheer =
    params.completedLastWeek > 0 || params.submittedLastWeek > 0
      ? "先週もお疲れさまでした。この調子で続けていきましょう。"
      : "先週は学習の記録がありませんでした。まずは1本、短い時間から再開してみましょう。";

  return renderTemplatedEmail({
    key: "weekly_digest",
    texts,
    displayName: params.displayName,
    values: {
      completed_last_week: String(params.completedLastWeek),
      submitted_last_week: String(params.submittedLastWeek),
      weekly_cheer: cheer,
      next_content_title: params.nextContent?.title ?? "",
      suggested_goal: params.nextContent
        ? String(suggestWeeklyGoal(params.completedLastWeek, params.remainingContents))
        : "",
      remaining_contents: params.nextContent ? String(params.remainingContents) : "",
      all_completed_message: params.nextContent
        ? ""
        : "公開中の学習コンテンツはすべて完了しています。演習の見直しや、AI レビューを参考にした改善に取り組んでみましょう。",
    },
    links: params.nextContent
      ? [{ label: "続きから学ぶ", url: buildAppUrl(params.appUrl, params.nextContent.path) }]
      : [{ label: "ダッシュボードを開く", url: buildAppUrl(params.appUrl, "/") }],
    unsubscribeUrl: params.unsubscribeUrl,
  });
}

export type InactivityReminderEmailParams = PromotionalEmailParams & {
  /** First content to learn (first viewable); without one, guide to the learning top. */
  firstContent: EmailContentLink | null;
};

export function buildInactivityReminderEmail(
  params: InactivityReminderEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  return renderTemplatedEmail({
    key: "inactivity_reminder",
    texts,
    displayName: params.displayName,
    values: {
      first_content_title: params.firstContent?.title ?? "",
      no_content_guide: params.firstContent
        ? ""
        : "学習コンテンツの一覧から、最初の1本を選んで始めてみましょう。",
    },
    links: [
      params.firstContent
        ? { label: "最初の1本を始める", url: buildAppUrl(params.appUrl, params.firstContent.path) }
        : { label: "学習を始める", url: buildAppUrl(params.appUrl, "/learn") },
    ],
    unsubscribeUrl: params.unsubscribeUrl,
  });
}

export type TrialNurtureEmailParams = PromotionalEmailParams & {
  /**
   * Days since sign-up (configurable). The body is picked by the nearest guide stage at or below
   * the day (2 / 5 / 7 / 14), so the four stages cover any configured day.
   */
  day: number;
  /** Whether this is the last configured guide (only then does the body say it is the last). */
  isFinal: boolean;
  /** Guide to upgrade (`/upgrade`) only when Stripe payments are enabled (`isStripeEnabled()`). */
  upgradeAvailable: boolean;
  /**
   * Theme names including contents that become viewable after full registration (used for the Day
   * 7 guide).
   */
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

const TRIAL_NURTURE_STAGES = [14, 7, 5, 2] as const;

function trialNurtureStage(day: number): (typeof TRIAL_NURTURE_STAGES)[number] {
  return TRIAL_NURTURE_STAGES.find((stage) => day >= stage) ?? TRIAL_NURTURE_STAGES[3];
}

/** "7" -> "1週間", "14" -> "2週間", other days -> "N日". */
function elapsedLabel(day: number): string {
  return day % 7 === 0 ? `${day / 7}週間` : `${day}日`;
}

export function buildTrialNurtureEmail(
  params: TrialNurtureEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  const stage = trialNurtureStage(params.day);
  const common = {
    texts,
    displayName: params.displayName,
    unsubscribeUrl: params.unsubscribeUrl,
  };
  const learnLinks = [{ label: "学習コンテンツを開く", url: buildAppUrl(params.appUrl, "/learn") }];

  switch (stage) {
    case 2:
      return renderTemplatedEmail({
        ...common,
        key: "trial_nurture.day2",
        values: {},
        links: learnLinks,
      });
    case 5:
      return renderTemplatedEmail({
        ...common,
        key: "trial_nurture.day5",
        values: {},
        links: learnLinks,
      });
    case 7:
      return renderTemplatedEmail({
        ...common,
        key: "trial_nurture.day7",
        values: {
          elapsed_label: elapsedLabel(params.day),
          locked_themes: params.lockedThemeNames.slice(0, 5).join("、"),
          registration_guide: registrationSentence(params.upgradeAvailable),
        },
        links: registrationLinks(params.appUrl, params.upgradeAvailable),
      });
    default:
      return renderTemplatedEmail({
        ...common,
        key: "trial_nurture.day14",
        values: {
          elapsed_label: elapsedLabel(params.day),
          final_notice: params.isFinal ? "お試しユーザーへのご案内メールはこれが最後です。" : "",
          registration_guide: registrationSentence(params.upgradeAvailable),
        },
        links: registrationLinks(params.appUrl, params.upgradeAvailable),
      });
  }
}

export type AnnouncementEmailParams = PromotionalEmailParams & {
  announcementId: number;
  title: string;
  /** Announcement body converted with `renderEmailMarkdown()` (converted once, not per recipient). */
  body: EmailMarkdown;
};

/** Bulk announcement email (promotional; always includes the unsubscribe link). */
export function buildAnnouncementEmail(
  params: AnnouncementEmailParams,
  texts: EmailTexts = DEFAULT_EMAIL_TEXTS
): EmailContent {
  return renderTemplatedEmail({
    key: "announcement",
    texts,
    displayName: params.displayName,
    values: { title: params.title },
    announcementBody: params.body,
    links: [
      {
        label: "お知らせを開く",
        url: buildAppUrl(params.appUrl, `/announcements/${params.announcementId}`),
      },
    ],
    unsubscribeUrl: params.unsubscribeUrl,
  });
}

import type { EmailTemplateKey, EmailTexts } from "@/app/lib/email-template";
import { renderEmailMarkdown } from "@/app/lib/markdown-email";
import type { EmailContent } from "@/app/services/notifications/email";
import {
  buildAnnouncementEmail,
  buildApprovedEmail,
  buildCancelScheduledEmail,
  buildCertificateIssuedEmail,
  buildInactivityReminderEmail,
  buildSignupEmail,
  buildSubscriptionEndedEmail,
  buildTrialNurtureEmail,
  buildUpgradedEmail,
  buildWeeklyDigestEmail,
} from "@/app/services/notifications/email-templates";

export type PreviewVariant = { id: string; label: string };

type PreviewContext = { appUrl: string; unsubscribeUrl: string; texts: EmailTexts };

type VariantDefinition = PreviewVariant & { build: (context: PreviewContext) => EmailContent };

const SAMPLE_NAME = "山田 太郎";

const SAMPLE_ANNOUNCEMENT_BODY = [
  "**重要**なお知らせの本文です。",
  "",
  "- 項目1",
  "- 項目2",
  "",
  "詳しくは [こちら](https://example.com/notice) をご覧ください。",
].join("\n");

const base = (context: PreviewContext) => ({
  displayName: SAMPLE_NAME,
  appUrl: context.appUrl,
});

const promotional = (context: PreviewContext) => ({
  ...base(context),
  unsubscribeUrl: context.unsubscribeUrl,
});

const single = (build: VariantDefinition["build"]): VariantDefinition[] => [
  { id: "default", label: "標準", build },
];

/**
 * Sample renderings per template. Each variant drives the real builder with sample values, so the
 * preview is exactly what a recipient gets, including the conditional lines (price / date present
 * or missing, Stripe on / off...) and the parts fixed in code (greeting, buttons, footer).
 */
const PREVIEW_VARIANTS: Record<EmailTemplateKey, VariantDefinition[]> = {
  signup: [
    {
      id: "stripe_on",
      label: "Stripe 決済が有効",
      build: (c) => buildSignupEmail({ ...base(c), upgradeAvailable: true }, c.texts),
    },
    {
      id: "stripe_off",
      label: "Stripe 決済が無効",
      build: (c) => buildSignupEmail({ ...base(c), upgradeAvailable: false }, c.texts),
    },
  ],
  approved: single((c) =>
    buildApprovedEmail({ ...base(c), membershipLabel: "コミュニティ会員" }, c.texts)
  ),
  upgraded: [
    {
      id: "full",
      label: "料金・次回日あり",
      build: (c) =>
        buildUpgradedEmail(
          {
            ...base(c),
            monthlyPriceLabel: "月額 1,000 円（税込）",
            nextBillingDateLabel: "2026年11月1日",
          },
          c.texts
        ),
    },
    {
      id: "no_price",
      label: "料金を取得できない",
      build: (c) =>
        buildUpgradedEmail(
          { ...base(c), monthlyPriceLabel: null, nextBillingDateLabel: "2026年11月1日" },
          c.texts
        ),
    },
    {
      id: "no_date",
      label: "次回日を取得できない",
      build: (c) =>
        buildUpgradedEmail(
          { ...base(c), monthlyPriceLabel: "月額 1,000 円（税込）", nextBillingDateLabel: null },
          c.texts
        ),
    },
  ],
  cancel_scheduled: [
    {
      id: "with_date",
      label: "期限の日付あり",
      build: (c) =>
        buildCancelScheduledEmail({ ...base(c), periodEndDateLabel: "2026年10月31日" }, c.texts),
    },
    {
      id: "no_date",
      label: "期限の日付なし",
      build: (c) => buildCancelScheduledEmail({ ...base(c), periodEndDateLabel: null }, c.texts),
    },
  ],
  subscription_ended: single((c) => buildSubscriptionEndedEmail(base(c), c.texts)),
  certificate_issued: single((c) =>
    buildCertificateIssuedEmail(
      {
        ...base(c),
        certificateId: 1,
        themeName: "GAS 学習（基礎編）",
        certificateNo: "SS-202610-ABC123",
      },
      c.texts
    )
  ),
  weekly_digest: [
    {
      id: "active",
      label: "先週学習あり・次のコンテンツあり",
      build: (c) =>
        buildWeeklyDigestEmail(
          {
            ...promotional(c),
            completedLastWeek: 3,
            submittedLastWeek: 2,
            nextContent: { title: "JavaScript の基本", path: "/learn/1" },
            remainingContents: 12,
          },
          c.texts
        ),
    },
    {
      id: "inactive",
      label: "先週の学習なし",
      build: (c) =>
        buildWeeklyDigestEmail(
          {
            ...promotional(c),
            completedLastWeek: 0,
            submittedLastWeek: 0,
            nextContent: { title: "JavaScript の基本", path: "/learn/1" },
            remainingContents: 12,
          },
          c.texts
        ),
    },
    {
      id: "all_done",
      label: "すべて完了している",
      build: (c) =>
        buildWeeklyDigestEmail(
          {
            ...promotional(c),
            completedLastWeek: 1,
            submittedLastWeek: 1,
            nextContent: null,
            remainingContents: 0,
          },
          c.texts
        ),
    },
  ],
  inactivity_reminder: [
    {
      id: "with_content",
      label: "最初のコンテンツあり",
      build: (c) =>
        buildInactivityReminderEmail(
          { ...promotional(c), firstContent: { title: "はじめてのHTML", path: "/learn/1" } },
          c.texts
        ),
    },
    {
      id: "no_content",
      label: "最初のコンテンツなし",
      build: (c) =>
        buildInactivityReminderEmail({ ...promotional(c), firstContent: null }, c.texts),
    },
  ],
  "trial_nurture.day2": single((c) =>
    buildTrialNurtureEmail(
      {
        ...promotional(c),
        day: 2,
        isFinal: false,
        upgradeAvailable: true,
        lockedThemeNames: [],
      },
      c.texts
    )
  ),
  "trial_nurture.day5": single((c) =>
    buildTrialNurtureEmail(
      {
        ...promotional(c),
        day: 5,
        isFinal: false,
        upgradeAvailable: true,
        lockedThemeNames: [],
      },
      c.texts
    )
  ),
  "trial_nurture.day7": [
    {
      id: "stripe_on_themes",
      label: "Stripe 有効・テーマあり",
      build: (c) =>
        buildTrialNurtureEmail(
          {
            ...promotional(c),
            day: 7,
            isFinal: false,
            upgradeAvailable: true,
            lockedThemeNames: ["React 入門", "データベース設計"],
          },
          c.texts
        ),
    },
    {
      id: "stripe_off_no_themes",
      label: "Stripe 無効・テーマなし",
      build: (c) =>
        buildTrialNurtureEmail(
          {
            ...promotional(c),
            day: 7,
            isFinal: false,
            upgradeAvailable: false,
            lockedThemeNames: [],
          },
          c.texts
        ),
    },
  ],
  "trial_nurture.day14": [
    {
      id: "final",
      label: "最後の案内（14日目）",
      build: (c) =>
        buildTrialNurtureEmail(
          {
            ...promotional(c),
            day: 14,
            isFinal: true,
            upgradeAvailable: true,
            lockedThemeNames: [],
          },
          c.texts
        ),
    },
    {
      id: "not_final",
      label: "最後ではない案内（Stripe 無効）",
      build: (c) =>
        buildTrialNurtureEmail(
          {
            ...promotional(c),
            day: 20,
            isFinal: false,
            upgradeAvailable: false,
            lockedThemeNames: [],
          },
          c.texts
        ),
    },
  ],
  announcement: single((c) =>
    buildAnnouncementEmail(
      {
        ...promotional(c),
        announcementId: 1,
        title: "メンテナンスのお知らせ",
        body: renderEmailMarkdown(SAMPLE_ANNOUNCEMENT_BODY),
      },
      c.texts
    )
  ),
};

export function getPreviewVariants(key: EmailTemplateKey): PreviewVariant[] {
  return PREVIEW_VARIANTS[key].map(({ id, label }) => ({ id, label }));
}

/**
 * Renders the sample email for a template. `texts` may carry an unsaved draft. The unsubscribe
 * link is a placeholder URL that no token verifies against, so a preview or test send can never
 * unsubscribe anyone. Unknown variants fall back to the first one.
 */
export function buildPreviewEmail(
  key: EmailTemplateKey,
  variantId: string | undefined,
  texts: EmailTexts,
  appUrl: string
): EmailContent {
  const variants = PREVIEW_VARIANTS[key];
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  return variant.build({
    appUrl,
    unsubscribeUrl: `${appUrl.replace(/\/+$/, "")}/api/email/unsubscribe?token=sample`,
    texts,
  });
}

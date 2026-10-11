/**
 * Editable email text (subject + Markdown body) and the pure logic around it: the key list, the
 * code defaults, placeholder allow-lists, validation and rendering. No I/O, so the DB loader, the
 * admin API and the tests share one definition.
 *
 * Injection safety: the body is converted to text / HTML while every placeholder is still an
 * opaque sentinel, and the values are put in afterwards (escaped for HTML). A value (display name,
 * content title...) is therefore never interpreted as Markdown or HTML.
 */

import {
  EMAIL_KIND,
  EMAIL_SERVICE_NAME,
  EMAIL_SERVICE_SUBTITLE,
  type EmailKind,
} from "@/app/constants/notifications";
import { escapeHtml } from "@/app/lib/escape-html";
import {
  type EmailMarkdown,
  joinEmailMarkdown,
  markdownToEmailHtml,
  markdownToEmailText,
} from "@/app/lib/markdown-email";

export const EMAIL_TEMPLATE_KEYS = [
  "signup",
  "approved",
  "upgraded",
  "cancel_scheduled",
  "subscription_ended",
  "weekly_digest",
  "inactivity_reminder",
  "trial_nurture.day2",
  "trial_nurture.day5",
  "trial_nurture.day7",
  "trial_nurture.day14",
  "announcement",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const isEmailTemplateKey = (value: unknown): value is EmailTemplateKey =>
  typeof value === "string" && (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);

export type EmailTemplateText = { subject: string; body: string };

export type EmailBranding = { serviceName: string; serviceSubtitle: string | null };

/**
 * Everything the pure builders need beyond the recipient: the branding and the stored overrides.
 * A key without an override renders its code default.
 */
export type EmailTexts = {
  branding: EmailBranding;
  templates: Partial<Record<EmailTemplateKey, EmailTemplateText>>;
};

export const DEFAULT_EMAIL_BRANDING: EmailBranding = {
  serviceName: EMAIL_SERVICE_NAME,
  serviceSubtitle: EMAIL_SERVICE_SUBTITLE,
};

export const DEFAULT_EMAIL_TEXTS: EmailTexts = { branding: DEFAULT_EMAIL_BRANDING, templates: {} };

/** Placeholder that receives the announcement's own Markdown body (announcement only). */
export const ANNOUNCEMENT_BODY_PLACEHOLDER = "announcement_body";

export type EmailTemplateDefinition = {
  key: EmailTemplateKey;
  kind: EmailKind;
  label: string;
  /** Current wording; used when no `email_templates` row exists. */
  subject: string;
  body: string;
  /** Allowed placeholders (`{{name}}`) and what each one inserts. */
  placeholders: Record<string, string>;
  /** Must appear exactly once in the body (the announcement body slot). */
  required: readonly string[];
};

const COMMON_PLACEHOLDERS = {
  display_name: "受講生の表示名（宛名の「〇〇 様」とは別に、本文中で呼びかけたいとき用）",
  service_name: "サービス名（管理画面で設定した差出人名）",
} as const;

const defs = (
  definition: Omit<EmailTemplateDefinition, "placeholders" | "required"> & {
    placeholders?: Record<string, string>;
    required?: readonly string[];
  }
): EmailTemplateDefinition => ({
  ...definition,
  placeholders: { ...COMMON_PLACEHOLDERS, ...definition.placeholders },
  required: definition.required ?? [],
});

const SUPPORT_GUIDE =
  "学習の進め方で困ったときは、ダッシュボードの「はじめかた」を確認するか、講座の運営（管理者）までお問い合わせください。";

const REGISTRATION_GUIDE_DESC =
  "本登録の案内文（Stripe 決済の有効・無効で文面が変わる。コードが選ぶ）";

export const EMAIL_TEMPLATE_DEFINITIONS: Record<EmailTemplateKey, EmailTemplateDefinition> = {
  signup: defs({
    key: "signup",
    kind: EMAIL_KIND.SIGNUP,
    label: "登録完了",
    subject: "ご登録ありがとうございます",
    body: [
      "「{{service_name}}」にご登録いただきありがとうございます。",
      "現在はお試しユーザーとして、お試し公開の学習コンテンツを閲覧し、演習課題を提出できます。まずは最初の学習コンテンツから始めてみましょう。",
      "{{registration_guide}}",
    ].join("\n\n"),
    placeholders: { registration_guide: REGISTRATION_GUIDE_DESC },
  }),
  approved: defs({
    key: "approved",
    kind: EMAIL_KIND.APPROVED,
    label: "承認完了",
    subject: "本登録が完了しました",
    body: [
      "管理者による承認が完了し、本登録が完了しました。すべての学習コンテンツをご利用いただけます。",
      "会員種別: {{membership_label}}",
    ].join("\n\n"),
    placeholders: { membership_label: "会員種別の表示名（例: コミュニティ会員）" },
  }),
  upgraded: defs({
    key: "upgraded",
    kind: EMAIL_KIND.UPGRADED,
    label: "有料会員化",
    subject: "一般有料会員へのご登録が完了しました",
    body: [
      "お支払いを確認し、一般有料会員へのご登録が完了しました。すべての学習コンテンツをご利用いただけます。",
      "料金: {{monthly_price}}",
      "次回のお支払い予定日: {{next_billing_date}}",
      "お支払い方法の変更や解約は、アップグレードページの「お支払い情報の管理・解約」から行えます。",
    ].join("\n\n"),
    placeholders: {
      monthly_price: "Stripe で確認できた月額料金（確認できないときは空で、その行は出ない）",
      next_billing_date: "次回のお支払い予定日（取得できないときは空で、その行は出ない）",
    },
  }),
  cancel_scheduled: defs({
    key: "cancel_scheduled",
    kind: EMAIL_KIND.CANCEL_SCHEDULED,
    label: "解約予約",
    subject: "解約のお手続きを受け付けました",
    body: [
      "一般有料会員の解約のお手続きを受け付けました。",
      "{{access_until}}、引き続きすべての学習コンテンツをご利用いただけます。",
      "期限までは、アップグレードページの「お支払い情報の管理・解約」から解約を取り消すことができます。",
    ].join("\n\n"),
    placeholders: {
      access_until:
        "利用できる期限（例: 2026年10月31日 まで。日付が無いときは「現在のお支払い期間の終了まで」）",
    },
  }),
  subscription_ended: defs({
    key: "subscription_ended",
    kind: EMAIL_KIND.SUBSCRIPTION_ENDED,
    label: "有料会員終了",
    subject: "一般有料会員の期間が終了しました",
    body: [
      "一般有料会員の期間が終了し、お試しユーザーに戻りました。",
      "お試し公開の学習コンテンツは引き続きご利用いただけます。",
      "一般有料会員は、アップグレードページからいつでも再開できます。",
    ].join("\n\n"),
  }),
  weekly_digest: defs({
    key: "weekly_digest",
    kind: EMAIL_KIND.WEEKLY_DIGEST,
    label: "週次進捗",
    subject: "今週の学習のお知らせ",
    body: [
      "先週の学習: コンテンツ完了 {{completed_last_week}} 本 / 演習の提出 {{submitted_last_week}} 件",
      "{{weekly_cheer}}",
      "次に学ぶコンテンツ: {{next_content_title}}",
      "今週の目標の提案: コンテンツを {{suggested_goal}} 本完了させてみましょう（残り {{remaining_contents}} 本）。",
      "{{all_completed_message}}",
    ].join("\n\n"),
    placeholders: {
      completed_last_week: "先週完了したコンテンツ数",
      submitted_last_week: "先週提出した演習数",
      weekly_cheer: "先週の実績に応じた一言（コードが選ぶ）",
      next_content_title: "次に学ぶコンテンツ名（全て完了しているときは空で、その行は出ない）",
      suggested_goal: "今週の目標本数の提案（全て完了しているときは空）",
      remaining_contents: "残りのコンテンツ数（全て完了しているときは空）",
      all_completed_message: "全て完了しているときだけ入る案内文（それ以外は空で、その行は出ない）",
    },
  }),
  inactivity_reminder: defs({
    key: "inactivity_reminder",
    kind: EMAIL_KIND.INACTIVITY_REMINDER,
    label: "未学習リマインド",
    subject: "最初の1本から始めてみませんか",
    body: [
      "ご登録ありがとうございます。まだ学習を始められていないようでしたので、ご案内をお送りしました。",
      "最初の1本「{{first_content_title}}」は短い時間で取り組めます。まずはここから始めてみましょう。",
      "{{no_content_guide}}",
      SUPPORT_GUIDE,
    ].join("\n\n"),
    placeholders: {
      first_content_title: "最初に学ぶコンテンツ名（見つからないときは空で、その行は出ない）",
      no_content_guide: "最初のコンテンツが見つからないときだけ入る案内文（それ以外は空）",
    },
  }),
  "trial_nurture.day2": defs({
    key: "trial_nurture.day2",
    kind: EMAIL_KIND.TRIAL_NURTURE,
    label: "お試しユーザー向け案内（2日目）",
    subject: "演習を出してみましょう",
    body: [
      "お試し期間でも、お試し公開の演習課題を提出できます。",
      "手を動かして書いたコードを提出すると、学んだ内容がしっかり身につきます。まずは1つ、演習を提出してみましょう。",
    ].join("\n\n"),
  }),
  "trial_nurture.day5": defs({
    key: "trial_nurture.day5",
    kind: EMAIL_KIND.TRIAL_NURTURE,
    label: "お試しユーザー向け案内（5日目）",
    subject: "AI レビューを受けてみましょう",
    body: [
      "演習を提出すると、AI があなたのコードをレビューし、良い点と改善点を返します。",
      "レビューを参考に書き直して再提出すると、理解がさらに深まります。提出した演習の画面から AI レビューを試してみましょう。",
    ].join("\n\n"),
  }),
  "trial_nurture.day7": defs({
    key: "trial_nurture.day7",
    kind: EMAIL_KIND.TRIAL_NURTURE,
    label: "お試しユーザー向け案内（7日目）",
    subject: "本登録で学べる内容のご案内",
    body: [
      "ご登録から{{elapsed_label}}が経ちました。学習一覧で鍵のマークが付いているコンテンツは、本登録後にご利用いただけます。",
      "本登録で学べるテーマ: {{locked_themes}}",
      "{{registration_guide}}",
    ].join("\n\n"),
    placeholders: {
      elapsed_label:
        "登録からの経過日数の表記（例: 1週間 / 10日。送る日の設定に合わせてコードが決める）",
      locked_themes: "本登録で学べるテーマ名（無いときは空で、その行は出ない）",
      registration_guide: REGISTRATION_GUIDE_DESC,
    },
  }),
  "trial_nurture.day14": defs({
    key: "trial_nurture.day14",
    kind: EMAIL_KIND.TRIAL_NURTURE,
    label: "お試しユーザー向け案内（14日目以降）",
    subject: "お試し期間のご案内",
    body: [
      "ご登録から{{elapsed_label}}が経ちました。{{final_notice}}",
      "お試し公開のコンテンツは引き続きご利用いただけます。",
      "{{registration_guide}}",
    ].join("\n\n"),
    placeholders: {
      elapsed_label: "登録からの経過日数の表記（例: 2週間 / 20日）",
      final_notice:
        "「これが最後です」の案内（設定した最後の案内のときだけ入り、それ以外は空になる）",
      registration_guide: REGISTRATION_GUIDE_DESC,
    },
  }),
  announcement: defs({
    key: "announcement",
    kind: EMAIL_KIND.ANNOUNCEMENT,
    label: "お知らせ一斉送信",
    subject: "お知らせ: {{title}}",
    body: ["運営からのお知らせです。", "■ {{title}}", `{{${ANNOUNCEMENT_BODY_PLACEHOLDER}}}`].join(
      "\n\n"
    ),
    placeholders: {
      title: "お知らせのタイトル",
      [ANNOUNCEMENT_BODY_PLACEHOLDER]:
        "お知らせ本文（お知らせ管理で書いたMarkdownがここに入る。本文中に1回だけ必要）",
    },
    required: [ANNOUNCEMENT_BODY_PLACEHOLDER],
  }),
};

/** Placeholders that hold Markdown of their own and therefore cannot appear in a subject. */
const BODY_ONLY_PLACEHOLDERS: ReadonlySet<string> = new Set([ANNOUNCEMENT_BODY_PLACEHOLDER]);

const PLACEHOLDER = /\{\{([^{}\n]{0,64})\}\}/g;

function placeholderNames(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1].trim());
}

export type TemplateValidation = {
  ok: boolean;
  /** Placeholders that are not allowed for this template (sorted, unique). */
  unknown: string[];
  /** Required placeholders that are missing or repeated in the body. */
  invalidRequired: string[];
  /** Body-only placeholders used in the subject. */
  bodyOnlyInSubject: string[];
};

/**
 * Checks a subject/body pair against the template's allow-list. Anything wrapped in `{{ }}` that
 * is not on the list counts as unknown, so a typo is rejected instead of being sent literally.
 */
export function validateEmailTemplateText(
  key: EmailTemplateKey,
  text: EmailTemplateText
): TemplateValidation {
  const definition = EMAIL_TEMPLATE_DEFINITIONS[key];
  const subjectNames = placeholderNames(text.subject);
  const bodyNames = placeholderNames(text.body);
  const unknown = [...new Set([...subjectNames, ...bodyNames])]
    .filter((name) => !Object.hasOwn(definition.placeholders, name))
    .sort();
  const invalidRequired = definition.required.filter(
    (name) => bodyNames.filter((n) => n === name).length !== 1
  );
  const bodyOnlyInSubject = [...new Set(subjectNames.filter((n) => BODY_ONLY_PLACEHOLDERS.has(n)))];
  return {
    ok: unknown.length === 0 && invalidRequired.length === 0 && bodyOnlyInSubject.length === 0,
    unknown,
    invalidRequired: [...invalidRequired],
    bodyOnlyInSubject,
  };
}

/** The stored text for a key when it is usable, else the code default. */
export function resolveEmailTemplateText(
  key: EmailTemplateKey,
  texts: EmailTexts
): EmailTemplateText {
  const stored = texts.templates[key];
  if (stored && validateEmailTemplateText(key, stored).ok) {
    return stored;
  }
  const { subject, body } = EMAIL_TEMPLATE_DEFINITIONS[key];
  return { subject, body };
}

const SENTINEL_OPEN = "\uE000";
const SENTINEL_CLOSE = "\uE001";
const SENTINEL = /\uE000(\d+)\uE001/g;
const SENTINEL_CHARS = /[\uE000\uE001]/g;
// Control characters, line/paragraph separators and our own sentinels.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const UNSAFE_VALUE_CHARS = /[\u0000-\u001f\u007f\u2028\u2029\uE000\uE001]+/g;

/** Values are single-line text: control characters (incl. CR/LF) and sentinels become a space. */
export function sanitizeEmailValue(value: string): string {
  return value.replace(UNSAFE_VALUE_CHARS, " ").trim();
}

export type EmailTemplateValues = Record<string, string>;

function substitutePlain(text: string, values: EmailTemplateValues): string {
  return text.replace(PLACEHOLDER, (whole, raw: string) => {
    const name = raw.trim();
    return Object.hasOwn(values, name) ? sanitizeEmailValue(values[name]) : whole;
  });
}

/** Subject: values are inserted directly; no line break can survive. */
export function renderEmailSubject(subject: string, values: EmailTemplateValues): string {
  return substitutePlain(subject.replace(UNSAFE_VALUE_CHARS, " "), values)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drops lines whose placeholders are all empty ("value missing, omit the line"). A line without
 * placeholders is always kept; a line with several keeps as long as one has a value.
 */
function dropEmptyLines(body: string, values: EmailTemplateValues): string {
  return body
    .split(/\r\n|\r|\n/)
    .filter((line) => {
      const names = placeholderNames(line).filter((name) => Object.hasOwn(values, name));
      return names.length === 0 || names.some((name) => sanitizeEmailValue(values[name]) !== "");
    })
    .join("\n");
}

function renderBodyPart(part: string, values: EmailTemplateValues): EmailMarkdown {
  const slots: string[] = [];
  const withSentinels = dropEmptyLines(part.replace(SENTINEL_CHARS, ""), values).replace(
    PLACEHOLDER,
    (whole, raw: string) => {
      const name = raw.trim();
      if (!Object.hasOwn(values, name)) {
        return whole;
      }
      slots.push(sanitizeEmailValue(values[name]));
      return `${SENTINEL_OPEN}${slots.length - 1}${SENTINEL_CLOSE}`;
    }
  );
  const fill = (converted: string, format: "text" | "html") =>
    converted.replace(SENTINEL, (_whole, index: string) =>
      format === "html" ? escapeHtml(slots[Number(index)]) : slots[Number(index)]
    );
  return {
    text: fill(markdownToEmailText(withSentinels), "text"),
    html: fill(markdownToEmailHtml(withSentinels), "html"),
    __brand: "EmailMarkdown",
  };
}

/**
 * Renders a body. The `announcement_body` slot (when present in the template) is filled with the
 * announcement's own pre-converted Markdown; text before and after it is rendered separately.
 */
export function renderEmailBody(
  body: string,
  values: EmailTemplateValues,
  announcementBody?: EmailMarkdown
): EmailMarkdown {
  const slotPattern = new RegExp(`\\{\\{\\s*${ANNOUNCEMENT_BODY_PLACEHOLDER}\\s*\\}\\}`);
  const match = slotPattern.exec(body);
  if (!announcementBody || !match) {
    // Without a slot value the marker must not leak into the mail.
    return renderBodyPart(body.replace(slotPattern, ""), values);
  }
  const before = body.slice(0, match.index);
  const after = body.slice(match.index + match[0].length);
  return joinEmailMarkdown([
    renderBodyPart(before, values),
    announcementBody,
    renderBodyPart(after, values),
  ]);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_LANGUAGES } from "@/app/components/code-editor-utils";
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_TARGET_STATUSES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
} from "@/app/constants/announcements";
import {
  ALLOWED_SUBMISSION_TYPES,
  BULK_CONTENT_ACTIONS,
  CONTENT_TYPES,
  MAX_BULK_CONTENT_IDS,
  MAX_BULK_CREATE_CONTENTS,
  SUBMISSION_TYPES,
} from "@/app/constants/content";
import { STARTER_FILES_MAX_TOTAL_LENGTH } from "@/app/constants/gemini";
import { GRADING_RUBRIC_DRAFT_INPUT_MAX_LENGTH } from "@/app/constants/grading";
import {
  EMAIL_DIGEST_DAILY_LIMIT_MAX,
  EMAIL_DIGEST_DAILY_LIMIT_MIN,
  EMAIL_KIND_WITH_SEND_WEEKDAY,
  EMAIL_KINDS,
  EMAIL_KINDS_WITH_SEND_DAYS,
  EMAIL_SEND_DAY_MAX,
  EMAIL_SEND_DAY_MIN,
  EMAIL_SEND_DAYS_MAX_COUNT,
  EMAIL_SERVICE_NAME_MAX,
  EMAIL_SERVICE_SUBTITLE_MAX,
  EMAIL_TEMPLATE_BODY_MAX,
  EMAIL_TEMPLATE_SUBJECT_MAX,
  type EmailKind,
  PUSH_KINDS,
} from "@/app/constants/notifications";
import {
  QUIZ_MAX_CHOICES,
  QUIZ_MAX_QUESTIONS,
  QUIZ_TEXT_ANSWER_MAX_LENGTH,
} from "@/app/constants/quiz";
import { REVIEW_NOTE_MEMO_MAX_LENGTH } from "@/app/constants/review-list";
import {
  MEMBERSHIP_TYPES,
  USER_MANAGEMENT_ACTIONS,
  USER_ROLES,
  USER_STATUS,
} from "@/app/constants/user";
import { parseDisplayName } from "@/app/lib/display-name";
import {
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
  validateEmailTemplateText,
} from "@/app/lib/email-template";
import { GradingRubricInputSchema } from "@/app/lib/grading-schema";
import { parseNotificationEmail } from "@/app/lib/notification-email";
import { QuizQuestionsSchema } from "@/app/lib/quiz";
import { isBlankSlidePdfUrl, toSlideObjectKey } from "@/app/lib/slide-object-key";
import { SUBMISSION_FILE_SLOT_MAX_COUNT } from "@/app/lib/submission-file-slots";

export const PositiveIntSchema = z
  .number({ message: "数値で指定してください" })
  .int({ message: "整数で指定してください" })
  .positive({ message: "正の整数で指定してください" });

export const ContentIdSchema = PositiveIntSchema;
export const UserIdSchema = PositiveIntSchema;

// z.enum() accepts readonly arrays (per the pinned zod 4 types), so pass the existing readonly
// constant directly.
export const ContentTypeSchema = z.enum(CONTENT_TYPES);
export const SubmissionTypeSchema = z.enum(SUBMISSION_TYPES);
export const AllowedSubmissionTypeSchema = z.enum(ALLOWED_SUBMISSION_TYPES);
export const CodeLanguageSchema = z.enum(CODE_LANGUAGES);
export const MembershipTypeSchema = z.enum(MEMBERSHIP_TYPES);
export const UserRoleSchema = z.enum(USER_ROLES);
export const BulkContentActionSchema = z.enum(BULK_CONTENT_ACTIONS);

// No trim, to keep the same acceptance as the existing truthy `!title` checks (only empty string
// rejected); trimming would newly reject whitespace-only strings that were allowed before.
const RequiredStringSchema = z
  .string({ message: "文字列で指定してください" })
  .min(1, { message: "空文字は指定できません" });

const OptionalNullableString = z.string().nullable().optional();

/**
 * Stored slide PDF value: an object key in the `slides` bucket (e.g. `gas/slide-01.pdf`). Legacy
 * public URLs are normalized to keys; values not interpretable as a key (e.g. external URLs) are
 * rejected, because the Storage SELECT policy compares `pdf_url = storage.objects.name` and any
 * other value yields content with no signed URL (issue #89).
 * Empty / whitespace-only becomes null ("unset"). Saved as an empty string, the app treats it as
 * no slide while the migration pdf_url validation
 * (`20260917011152_validate_slide_pdf_url_object_keys.sql`) aborts on it as invalid (issue #243).
 */
const SlidePdfUrlSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null) {
      return value;
    }
    if (isBlankSlidePdfUrl(value)) {
      return null;
    }
    const objectKey = toSlideObjectKey(value);
    if (!objectKey) {
      ctx.addIssue({
        code: "custom",
        message: "pdf_urlはスライドのオブジェクトキー（例: gas/slide-01.pdf）で指定してください",
      });
      return z.NEVER;
    }
    return objectKey;
  });
const OptionalBoolean = z.boolean().optional();
/**
 * null means "first"; a number means right after that sibling ID. Required on create; optional on
 * update (omitted keeps display order; `.partial()` makes it optional). That it is a live sibling
 * under the same parent (not another parent, deleted, missing, or itself on update) is not
 * checked here but by resolveSiblingResequence() (app/lib/content-grouping.ts).
 */
const InsertAfterIdSchema = PositiveIntSchema.nullable();

export const ProgressUpdateSchema = z.object({
  contentId: ContentIdSchema,
  isCompleted: z.boolean({ message: "isCompletedはbooleanで指定してください" }),
});

/** PUT /api/review-notes. memo is rejected (not truncated) when longer than the max. */
export const ReviewNoteUpsertSchema = z
  .object({
    contentId: ContentIdSchema,
    requirementKey: z.string().min(1).nullable(),
    memo: z
      .string({ message: "memoは文字列で指定してください" })
      .max(REVIEW_NOTE_MEMO_MAX_LENGTH, {
        message: `memoは${REVIEW_NOTE_MEMO_MAX_LENGTH}文字以内で指定してください`,
      })
      .nullable()
      .optional(),
    understood: z.boolean({ message: "understoodはbooleanで指定してください" }).optional(),
  })
  .refine((value) => value.memo !== undefined || value.understood !== undefined, {
    message: "memo または understood のいずれかを指定してください",
  });

/** DELETE /api/review-notes */
export const ReviewNoteDeleteSchema = z.object({
  contentId: ContentIdSchema,
  requirementKey: z.string().min(1).nullable(),
});

export const SubmissionCreateSchema = z.object({
  contentId: ContentIdSchema,
  submissionType: SubmissionTypeSchema,
  // Single/multi-file routing, the codeContent back-compat fallback and URL trim/empty checks are
  // content business logic, so type validation is left to the route's existing logic.
  codeContent: z.unknown().optional(),
  codeFiles: z.unknown().optional(),
  url: z.unknown().optional(),
});

export const AiReviewRequestSchema = z.object({
  submissionId: PositiveIntSchema,
});

const AdminUserBaseSchema = z.object({ userId: UserIdSchema });

/**
 * Required fields differ per action, hence discriminatedUnion (approve/change_membership need
 * membershipType, change_role needs role, reject none). Typing it as
 * `Record<UserManagementAction, ...>` guarantees at compile time that every action in
 * USER_MANAGEMENT_ACTIONS is covered, while the array given to discriminatedUnion is derived from
 * USER_MANAGEMENT_ACTIONS (no re-hardcoded action strings).
 */
const ADMIN_USER_ACTION_SCHEMAS = {
  approve: AdminUserBaseSchema.extend({
    action: z.literal("approve"),
    membershipType: z.enum(MEMBERSHIP_TYPES),
  }),
  reject: AdminUserBaseSchema.extend({ action: z.literal("reject") }),
  change_role: AdminUserBaseSchema.extend({
    action: z.literal("change_role"),
    role: z.enum(USER_ROLES),
  }),
  change_membership: AdminUserBaseSchema.extend({
    action: z.literal("change_membership"),
    membershipType: z.enum(MEMBERSHIP_TYPES),
  }),
  resume_email: AdminUserBaseSchema.extend({ action: z.literal("resume_email") }),
  opt_out_email: AdminUserBaseSchema.extend({ action: z.literal("opt_out_email") }),
} as const satisfies Record<(typeof USER_MANAGEMENT_ACTIONS)[number], z.ZodType>;

export const AdminUserActionSchema = z.discriminatedUnion(
  "action",
  USER_MANAGEMENT_ACTIONS.map((action) => ADMIN_USER_ACTION_SCHEMAS[action]) as [
    (typeof ADMIN_USER_ACTION_SCHEMAS)[keyof typeof ADMIN_USER_ACTION_SCHEMAS],
    ...(typeof ADMIN_USER_ACTION_SCHEMAS)[keyof typeof ADMIN_USER_ACTION_SCHEMAS][],
  ],
  { message: `action は ${USER_MANAGEMENT_ACTIONS.join(" / ")} を指定してください` }
);

/** PATCH /api/settings/email: `false` unsubscribes from promotional mail, `true` resumes it. */
export const EmailPreferencesSchema = z
  .object({
    promotionalEmails: z.boolean({ message: "promotionalEmails は真偽値で指定してください" }),
  })
  .strict();

/**
 * PATCH /api/settings/profile. Unknown keys (`role`, `userId`, …) are stripped so they cannot be
 * written. The stored value is the trimmed name from parseDisplayName (shared with the form).
 */
export const ProfileUpdateSchema = z
  .object({
    displayName: z.string({ message: "displayName は文字列で指定してください" }),
  })
  .transform((value, ctx) => {
    const parsed = parseDisplayName(value.displayName);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.message, path: ["displayName"] });
      return z.NEVER;
    }
    return { displayName: parsed.name };
  });

/**
 * POST /api/settings/notification-email. Unknown keys are stripped. The stored value is the
 * trimmed, lowercased address from parseNotificationEmail (shared with the form).
 */
export const NotificationEmailRequestSchema = z
  .object({
    email: z.string({ message: "email は文字列で指定してください" }),
  })
  .transform((value, ctx) => {
    const parsed = parseNotificationEmail(value.email);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.message, path: ["email"] });
      return z.NEVER;
    }
    return { email: parsed.email };
  });

const EmailSendDaysSchema = z
  .array(
    z
      .number({ message: "送る日は数値で指定してください" })
      .int({ message: "送る日は整数で指定してください" })
      .min(EMAIL_SEND_DAY_MIN, { message: `送る日は ${EMAIL_SEND_DAY_MIN} 以上にしてください` })
      .max(EMAIL_SEND_DAY_MAX, { message: `送る日は ${EMAIL_SEND_DAY_MAX} 以下にしてください` }),
    { message: "送る日は配列で指定してください" }
  )
  .min(1, { message: "送る日を1つ以上指定してください" })
  .max(EMAIL_SEND_DAYS_MAX_COUNT, {
    message: `送る日は ${EMAIL_SEND_DAYS_MAX_COUNT} 個までです`,
  })
  .refine((days) => new Set(days).size === days.length, { message: "送る日が重複しています" })
  .transform((days) => [...days].sort((a, b) => a - b));

/**
 * PUT /api/admin/email-settings. Either one kind's settings (`kind` plus at least one of
 * enabled / send_days / send_weekday) or the shared daily limit (`digest_daily_limit` alone).
 * send_days and send_weekday are only accepted for the kinds that use them, so a value that the
 * sender would ignore is never stored.
 */
export const EmailSettingsUpdateSchema = z
  .object({
    kind: z.enum(EMAIL_KINDS as [EmailKind, ...EmailKind[]]).optional(),
    sending_enabled: z
      .boolean({ message: "sending_enabled は真偽値で指定してください" })
      .optional(),
    enabled: z.boolean({ message: "enabled は真偽値で指定してください" }).optional(),
    push_enabled: z.boolean({ message: "push_enabled は真偽値で指定してください" }).optional(),
    send_days: EmailSendDaysSchema.optional(),
    send_weekday: z
      .number({ message: "曜日は数値で指定してください" })
      .int({ message: "曜日は整数で指定してください" })
      .min(0, { message: "曜日は 0（日曜）〜6（土曜）で指定してください" })
      .max(6, { message: "曜日は 0（日曜）〜6（土曜）で指定してください" })
      .optional(),
    digest_daily_limit: z
      .number({ message: "1日の上限は数値で指定してください" })
      .int({ message: "1日の上限は整数で指定してください" })
      .min(EMAIL_DIGEST_DAILY_LIMIT_MIN, {
        message: `1日の上限は ${EMAIL_DIGEST_DAILY_LIMIT_MIN} 以上にしてください`,
      })
      .max(EMAIL_DIGEST_DAILY_LIMIT_MAX, {
        message: `1日の上限は ${EMAIL_DIGEST_DAILY_LIMIT_MAX} 以下にしてください`,
      })
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (value.kind === undefined) {
      const targets = [value.digest_daily_limit, value.sending_enabled].filter(
        (v) => v !== undefined
      ).length;
      if (targets === 0) {
        fail("kind、digest_daily_limit、sending_enabled のいずれかを指定してください");
      } else if (
        targets > 1 ||
        value.enabled !== undefined ||
        value.push_enabled !== undefined ||
        value.send_days !== undefined ||
        value.send_weekday !== undefined
      ) {
        fail("種別の設定・1日の上限・全体スイッチは別々に更新してください");
      }
      return;
    }
    if (value.digest_daily_limit !== undefined || value.sending_enabled !== undefined) {
      fail("種別の設定・1日の上限・全体スイッチは別々に更新してください");
    }
    if (
      value.enabled === undefined &&
      value.push_enabled === undefined &&
      value.send_days === undefined &&
      value.send_weekday === undefined
    ) {
      fail("更新する項目を指定してください");
    }
    if (
      value.push_enabled !== undefined &&
      !(PUSH_KINDS as readonly string[]).includes(value.kind)
    ) {
      fail("この種別はプッシュ通知に対応していません");
    }
    if (value.send_days !== undefined && !EMAIL_KINDS_WITH_SEND_DAYS.includes(value.kind)) {
      fail("この種別には送る日を設定できません");
    }
    if (value.send_weekday !== undefined && value.kind !== EMAIL_KIND_WITH_SEND_WEEKDAY) {
      fail("この種別には曜日を設定できません");
    }
  });

// Both POST (create) and PUT (update) take the insert position (insert_after_id). Update only
// makes every Create field optional, so it derives from `XxxCreateSchema.partial()`
// (insert_after_id is required on Create, optional on Update).
const ThemeBaseSchema = z.object({
  name: RequiredStringSchema,
  description: OptionalNullableString,
  is_published: OptionalBoolean,
  image_url: OptionalNullableString,
});
export const ThemeCreateSchema = ThemeBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const ThemeUpdateSchema = ThemeCreateSchema.partial();

const PhaseBaseSchema = z.object({
  theme_id: PositiveIntSchema,
  name: RequiredStringSchema,
  description: OptionalNullableString,
  is_published: OptionalBoolean,
});
export const PhaseCreateSchema = PhaseBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const PhaseUpdateSchema = PhaseCreateSchema.partial();

const WeekBaseSchema = z.object({
  phase_id: PositiveIntSchema,
  name: RequiredStringSchema,
  description: OptionalNullableString,
  is_published: OptionalBoolean,
});
export const WeekCreateSchema = WeekBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const WeekUpdateSchema = WeekCreateSchema.partial();

const StarterCodeFileSchema = z.object({
  filename: z
    .string({ message: "文字列で指定してください" })
    .trim()
    .min(1, { message: "ファイル名を入力してください" }),
  language: CodeLanguageSchema,
  content: z.string({ message: "文字列で指定してください" }),
});

/**
 * Exercise starter code (same shape as submissions.code_files). null clears. Total content length
 * is capped below the AI review submission limit so starters leave headroom for learner edits and
 * for the prompt that includes both starter and submission.
 */
const StarterFilesSchema = z
  .array(StarterCodeFileSchema)
  .min(1, { message: "初期コードは1ファイル以上指定してください" })
  .nullable()
  .optional()
  .superRefine((files, ctx) => {
    if (!files) {
      return;
    }
    const names = files.map((file) => file.filename);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({
        code: "custom",
        message: "初期コードのファイル名が重複しています",
      });
    }
    const totalLength = files.reduce((sum, file) => sum + file.content.length, 0);
    if (totalLength > STARTER_FILES_MAX_TOTAL_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message: `初期コードが長すぎます（上限: ${STARTER_FILES_MAX_TOTAL_LENGTH}文字）`,
      });
    }
  });

const SubmissionFileSlotSchema = z.object({
  filename: z
    .string({ message: "文字列で指定してください" })
    .trim()
    .min(1, { message: "ファイル名を入力してください" }),
  language: CodeLanguageSchema,
});

/**
 * Exercise submission layout. null clears (the app then uses one default file, or starter_files
 * when that column already names files). Shape only; alignment with starter_files is a refine.
 */
const SubmissionFileSlotsSchema = z
  .array(SubmissionFileSlotSchema)
  .min(1, { message: "提出ファイルは1つ以上指定してください" })
  .max(SUBMISSION_FILE_SLOT_MAX_COUNT, {
    message: `提出ファイルは${SUBMISSION_FILE_SLOT_MAX_COUNT}個までです`,
  })
  .superRefine((files, ctx) => {
    const names = files.map((file) => file.filename);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({
        code: "custom",
        message: "提出ファイルのファイル名が重複しています",
      });
    }
  })
  .nullable()
  .optional();

const ContentBaseSchema = z.object({
  title: RequiredStringSchema,
  week_id: PositiveIntSchema,
  content_type: ContentTypeSchema,
  video_url: OptionalNullableString,
  text_content: OptionalNullableString,
  description: OptionalNullableString,
  exercise_instructions: OptionalNullableString,
  hint: OptionalNullableString,
  reference_answer: OptionalNullableString,
  starter_files: StarterFilesSchema,
  submission_file_slots: SubmissionFileSlotsSchema,
  // The DB CHECK constraint is NOT NULL (with a default), so unlike other optional fields null is
  // not allowed.
  allowed_submission_types: AllowedSubmissionTypeSchema.optional(),
  code_language: CodeLanguageSchema.optional(),
  pdf_url: SlidePdfUrlSchema,
  // null clears the rubric. The stored version is derived server-side (nextGradingRubric), never
  // taken from the client. grading_rubric_version is only the version the editor loaded, so a
  // stale form cannot overwrite a newer save.
  grading_rubric: GradingRubricInputSchema.nullable().optional(),
  grading_rubric_version: z.number().int().positive().nullable().optional(),
  is_published: OptionalBoolean,
  is_open_to_trial: OptionalBoolean,
  // Only read when content_type is "quiz"; saved to quiz_questions, not learning_contents.
  quiz_questions: QuizQuestionsSchema.optional(),
});

// A quiz without questions would show learners an empty quiz, so content_type "quiz" in the body
// requires the questions. The reverse holds too: questions are only saved together with
// content_type "quiz", so sending them without it (or with another type) is rejected instead of
// being validated and then silently dropped. A PUT with neither leaves stored questions untouched.
function alignSubmissionFileSlots(
  value: {
    content_type?: string;
    submission_file_slots?: { filename: string; language: string }[] | null;
    starter_files?: { filename: string; language: string; content: string }[] | null;
    code_language?: string;
  },
  ctx: z.RefinementCtx
) {
  const slots = value.submission_file_slots;
  if (value.content_type !== undefined && value.content_type !== "exercise" && slots != null) {
    ctx.addIssue({
      code: "custom",
      message: "提出ファイルの構成は演習だけに設定できます",
      path: ["submission_file_slots"],
    });
  }
  // PUT fields are optional. Compare the pair only when this request sets both: the admin form
  // always sends them together, and a body that omits one side leaves the stored column as-is.
  const starter = value.starter_files;
  if (slots && starter) {
    const aligned =
      slots.length === starter.length &&
      slots.every(
        (slot, index) =>
          slot.filename === starter[index]?.filename && slot.language === starter[index]?.language
      );
    if (!aligned) {
      ctx.addIssue({
        code: "custom",
        message: "提出ファイルの構成と初期コードのファイル名・言語・並び順を揃えてください",
        path: ["submission_file_slots"],
      });
    }
  }
  if (
    slots &&
    slots.length > 0 &&
    value.code_language &&
    value.code_language !== slots[0].language
  ) {
    ctx.addIssue({
      code: "custom",
      message: "code_language は提出ファイルの1行目の言語と揃えてください",
      path: ["code_language"],
    });
  }
}

function requireQuizQuestions(
  value: { content_type?: string; quiz_questions?: unknown },
  ctx: z.RefinementCtx
) {
  if (value.content_type === "quiz" && value.quiz_questions === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "クイズには設問を登録してください",
      path: ["quiz_questions"],
    });
  }
  if (value.quiz_questions !== undefined && value.content_type !== "quiz") {
    ctx.addIssue({
      code: "custom",
      message: "設問を保存するときは content_type に quiz を指定してください",
      path: ["content_type"],
    });
  }
}

const ContentCreateObjectSchema = ContentBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const ContentCreateSchema =
  ContentCreateObjectSchema.superRefine(requireQuizQuestions).superRefine(alignSubmissionFileSlots);
function requireLoadedRubricVersion(
  value: {
    content_type?: string;
    grading_rubric?: unknown;
    grading_rubric_version?: number | null;
  },
  ctx: z.RefinementCtx
) {
  const clearsByType = value.content_type !== undefined && value.content_type !== "exercise";
  if (
    (value.grading_rubric !== undefined || clearsByType) &&
    value.grading_rubric_version === undefined
  ) {
    ctx.addIssue({
      code: "custom",
      message: "画面を開いたときの採点基準の版を指定してください",
      path: ["grading_rubric_version"],
    });
  }
}

export const ContentUpdateSchema = ContentCreateObjectSchema.partial()
  .superRefine(requireQuizQuestions)
  .superRefine(requireLoadedRubricVersion)
  .superRefine(alignSubmissionFileSlots);

const BULK_CREATE_MESSAGE = `contentsは1〜${MAX_BULK_CREATE_CONTENTS}件の配列で指定してください`;

/**
 * POST /api/manage/contents/bulk: registers many contents (e.g. a course's quizzes from the
 * manuscript) in one request. Each is appended to the end of its week in array order, so there is
 * no insert_after_id.
 */
export const BulkContentCreateSchema = z.object({
  contents: z
    .array(
      ContentBaseSchema.superRefine(requireQuizQuestions).superRefine(alignSubmissionFileSlots),
      { message: BULK_CREATE_MESSAGE }
    )
    .min(1, { message: BULK_CREATE_MESSAGE })
    .max(MAX_BULK_CREATE_CONTENTS, { message: BULK_CREATE_MESSAGE }),
});
export type BulkContentCreateItem = z.infer<typeof BulkContentCreateSchema>["contents"][number];

/**
 * POST /api/quiz/grade. Whether every question is answered is checked by grade_quiz_answers()
 * (the API cannot read the questions), so here only the shape is validated.
 */
export const QuizGradeRequestSchema = z.object({
  contentId: ContentIdSchema,
  answers: z
    .array(
      z.object({
        questionId: PositiveIntSchema,
        revision: z
          .string({ message: "設問の版を指定してください。ページを再読み込みしてください" })
          .max(64, { message: "設問の版が不正です" }),
        choices: z
          .array(
            z
              .number({ message: "選択肢は番号で指定してください" })
              .int({ message: "選択肢は整数の番号で指定してください" })
              .min(0, { message: "選択肢の番号は0以上で指定してください" }),
            { message: "選択肢は番号の配列で指定してください" }
          )
          .max(QUIZ_MAX_CHOICES, { message: `選択肢は${QUIZ_MAX_CHOICES}個までです` })
          .optional(),
        text: z
          .string()
          .max(QUIZ_TEXT_ANSWER_MAX_LENGTH, {
            message: `回答は${QUIZ_TEXT_ANSWER_MAX_LENGTH}文字以内で入力してください`,
          })
          .optional(),
      }),
      { message: "answersは配列で指定してください" }
    )
    .min(1, { message: "回答を入力してください" })
    .max(QUIZ_MAX_QUESTIONS, {
      message: "回答の数が設問の数を超えています。ページを再読み込みしてください",
    })
    .refine((answers) => new Set(answers.map((a) => a.questionId)).size === answers.length, {
      message: "同じ設問への回答が重複しています",
    }),
});

export const GradingRubricDraftRequestSchema = z.object({
  exercise_instructions: z
    .string()
    .trim()
    .min(1, { message: "演習指示を入力してください" })
    .max(GRADING_RUBRIC_DRAFT_INPUT_MAX_LENGTH, { message: "演習指示が長すぎます" }),
  reference_answer: z
    .string()
    .trim()
    .max(GRADING_RUBRIC_DRAFT_INPUT_MAX_LENGTH, { message: "模範回答が長すぎます" })
    .nullish(),
});

const BULK_CONTENT_IDS_MESSAGE = `idsは1〜${MAX_BULK_CONTENT_IDS}件の正の整数で指定してください`;

export const BulkContentUpdateSchema = z.object({
  ids: z
    .array(PositiveIntSchema, { message: BULK_CONTENT_IDS_MESSAGE })
    .min(1, { message: BULK_CONTENT_IDS_MESSAGE })
    .max(MAX_BULK_CONTENT_IDS, { message: BULK_CONTENT_IDS_MESSAGE }),
  action: BulkContentActionSchema,
  // The action-dependent check (required only for set_type) stays in buildPatch(), which
  // validates the value itself with isContentType(); here it is only accepted.
  contentType: z.unknown().optional(),
});

// ==================== /api/manage/announcements ====================

const hasNoDuplicates = (values: readonly string[]) => new Set(values).size === values.length;

/**
 * Announcement create/update (update also sends every field). Allowed values derive from
 * ANNOUNCEMENT_TARGET_STATUSES and MEMBERSHIP_TYPES. Trial users have no membership type, so an
 * announcement with a membership-type target cannot include them (same condition as RLS and the
 * app-layer target check; never save a combination that reaches nobody).
 */
export const AnnouncementSchema = z
  .object({
    title: z
      .string({ message: "タイトルは文字列で指定してください" })
      .trim()
      .min(1, { message: "タイトルを入力してください" })
      .max(ANNOUNCEMENT_TITLE_MAX_LENGTH, {
        message: `タイトルは${ANNOUNCEMENT_TITLE_MAX_LENGTH}文字以内で入力してください`,
      }),
    body: z
      .string({ message: "本文は文字列で指定してください" })
      .refine((value) => value.trim().length > 0, { message: "本文を入力してください" })
      .refine((value) => value.length <= ANNOUNCEMENT_BODY_MAX_LENGTH, {
        message: `本文は${ANNOUNCEMENT_BODY_MAX_LENGTH}文字以内で入力してください`,
      }),
    target_statuses: z
      .array(z.enum(ANNOUNCEMENT_TARGET_STATUSES), {
        message: "対象ステータスを指定してください",
      })
      .min(1, { message: "対象ステータスを1つ以上選んでください" })
      .refine(hasNoDuplicates, { message: "対象ステータスが重複しています" }),
    target_membership_types: z
      .array(MembershipTypeSchema)
      .min(1, { message: "対象の会員種別を1つ以上選ぶか、全種別を指定してください" })
      .refine(hasNoDuplicates, { message: "対象の会員種別が重複しています" })
      .nullable(),
    send_email: z.boolean({ message: "send_emailは真偽値で指定してください" }),
    is_published: z.boolean({ message: "is_publishedは真偽値で指定してください" }),
  })
  .refine(
    (value) =>
      value.target_membership_types === null || !value.target_statuses.includes(USER_STATUS.TRIAL),
    {
      message:
        "会員種別を指定する場合、お試しユーザーは対象にできません（お試しユーザーには会員種別がありません）",
      path: ["target_membership_types"],
    }
  );

export type AnnouncementInput = z.infer<typeof AnnouncementSchema>;

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

/**
 * Parses the body as JSON and validates it; both JSON and schema failures return 400 in the
 * unified `{ error: string }` shape. Callers check `success` and just return `response` on
 * failure.
 */
// Line breaks (incl. Unicode separators) would let a subject or sender name split a mail header.
const LINE_BREAK = /[\r\n\u2028\u2029]/;

const singleLine = (label: string, max: number, min: number) =>
  z
    .string({ message: `${label}は文字列で指定してください` })
    .refine((value) => !LINE_BREAK.test(value), { message: `${label}に改行は使えません` })
    .pipe(
      z
        .string()
        .trim()
        .min(min, { message: `${label}は${min}文字以上で入力してください` })
        .max(max, { message: `${label}は${max}文字以内で入力してください` })
    );

const EmailTemplateKeySchema = z.enum(EMAIL_TEMPLATE_KEYS, {
  message: "template_key が不正です",
});

const EmailTemplateBodyFieldSchema = z
  .string({ message: "本文は文字列で指定してください" })
  .min(1, { message: "本文を入力してください" })
  .max(EMAIL_TEMPLATE_BODY_MAX, {
    message: `本文は${EMAIL_TEMPLATE_BODY_MAX}文字以内で入力してください`,
  })
  .refine((value) => value.trim() !== "", { message: "本文を入力してください" });

/**
 * Rejects placeholders outside the template's allow-list (and a missing / repeated required one),
 * naming which ones failed so the admin can fix them.
 */
function refineTemplatePlaceholders(
  value: { template_key: EmailTemplateKey; subject: string; body: string },
  ctx: z.RefinementCtx
) {
  const check = validateEmailTemplateText(value.template_key, {
    subject: value.subject,
    body: value.body,
  });
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (check.unknown.length > 0) {
    fail(
      `このテンプレートでは使えないプレースホルダーがあります: ${check.unknown.map((n) => `{{${n}}}`).join(", ")}`
    );
  }
  if (check.bodyOnlyInSubject.length > 0) {
    fail(
      `件名には使えないプレースホルダーです: ${check.bodyOnlyInSubject.map((n) => `{{${n}}}`).join(", ")}`
    );
  }
  if (check.invalidRequired.length > 0) {
    fail(
      `本文に ${check.invalidRequired.map((n) => `{{${n}}}`).join(", ")} を1つだけ入れてください`
    );
  }
}

const EmailTemplateDraftShape = {
  template_key: EmailTemplateKeySchema,
  subject: singleLine("件名", EMAIL_TEMPLATE_SUBJECT_MAX, 1),
  body: EmailTemplateBodyFieldSchema,
};

export const EmailTemplateUpdateSchema = z
  .object(EmailTemplateDraftShape)
  .strict()
  .superRefine(refineTemplatePlaceholders);

export const EmailBrandingSchema = z
  .object({
    service_name: singleLine("サービス名", EMAIL_SERVICE_NAME_MAX, 1),
    service_subtitle: singleLine("補足（講座名）", EMAIL_SERVICE_SUBTITLE_MAX, 0),
  })
  .strict();

const EmailPreviewShape = {
  ...EmailTemplateDraftShape,
  variant: z.string().max(40).optional(),
  service_name: EmailBrandingSchema.shape.service_name.optional(),
  service_subtitle: EmailBrandingSchema.shape.service_subtitle.optional(),
};

/** Preview / test send: an unsaved draft plus which sample condition to show. */
export const EmailTemplatePreviewSchema = z
  .object(EmailPreviewShape)
  .strict()
  .superRefine(refineTemplatePlaceholders);

export const PushSubscriptionSchema = z
  .object({
    endpoint: z
      .string({ message: "endpoint を指定してください" })
      .url({ message: "endpoint の形式が不正です" })
      .max(4096, { message: "endpoint が長すぎます" }),
    keys: z
      .object({
        p256dh: z
          .string({ message: "keys.p256dh を指定してください" })
          .min(1, { message: "keys.p256dh を指定してください" })
          .max(256, { message: "keys.p256dh が長すぎます" }),
        auth: z
          .string({ message: "keys.auth を指定してください" })
          .min(1, { message: "keys.auth を指定してください" })
          .max(256, { message: "keys.auth が長すぎます" }),
      })
      .strict(),
  })
  .strict();

export const PushSubscriptionDeleteSchema = z
  .object({
    endpoint: z
      .string({ message: "endpoint を指定してください" })
      .url({ message: "endpoint の形式が不正です" })
      .max(4096, { message: "endpoint が長すぎます" }),
  })
  .strict();

export async function validateRequest<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ValidationResult<z.infer<T>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: "リクエストボディの形式が不正です" }, { status: 400 }),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(" / ");
    return {
      success: false,
      response: NextResponse.json({ error: message }, { status: 400 }),
    };
  }

  return { success: true, data: result.data };
}

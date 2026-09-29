import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_LANGUAGES } from "@/app/components/code-editor-utils";
import {
  ALLOWED_SUBMISSION_TYPES,
  BULK_CONTENT_ACTIONS,
  CONTENT_TYPES,
  MAX_BULK_CONTENT_IDS,
  SUBMISSION_TYPES,
} from "@/app/constants/content";
import { MEMBERSHIP_TYPES, USER_MANAGEMENT_ACTIONS, USER_ROLES } from "@/app/constants/user";
import { isBlankSlidePdfUrl, toSlideObjectKey } from "@/app/lib/slide-object-key";

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
} as const satisfies Record<(typeof USER_MANAGEMENT_ACTIONS)[number], z.ZodType>;

export const AdminUserActionSchema = z.discriminatedUnion(
  "action",
  USER_MANAGEMENT_ACTIONS.map((action) => ADMIN_USER_ACTION_SCHEMAS[action]) as [
    (typeof ADMIN_USER_ACTION_SCHEMAS)[keyof typeof ADMIN_USER_ACTION_SCHEMAS],
    ...(typeof ADMIN_USER_ACTION_SCHEMAS)[keyof typeof ADMIN_USER_ACTION_SCHEMAS][],
  ],
  { message: `action は ${USER_MANAGEMENT_ACTIONS.join(" / ")} を指定してください` }
);

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
  // The DB CHECK constraint is NOT NULL (with a default), so unlike other optional fields null is
  // not allowed.
  allowed_submission_types: AllowedSubmissionTypeSchema.optional(),
  code_language: CodeLanguageSchema.optional(),
  pdf_url: SlidePdfUrlSchema,
  is_published: OptionalBoolean,
  is_open_to_trial: OptionalBoolean,
});
export const ContentCreateSchema = ContentBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const ContentUpdateSchema = ContentCreateSchema.partial();

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

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

/**
 * Parses the body as JSON and validates it; both JSON and schema failures return 400 in the
 * unified `{ error: string }` shape. Callers check `success` and just return `response` on
 * failure.
 */
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

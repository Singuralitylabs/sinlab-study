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

// ==================== 共通スキーマ ====================

/** DBの主キー・件数上限等、Route間で共通の正の整数 */
export const PositiveIntSchema = z
  .number({ message: "数値で指定してください" })
  .int({ message: "整数で指定してください" })
  .positive({ message: "正の整数で指定してください" });

export const ContentIdSchema = PositiveIntSchema;
export const UserIdSchema = PositiveIntSchema;

// z.enum() は readonly 配列をそのまま受け取れる（固定している zod 4系の型定義より）ため、
// 既存定数の readonly 配列を変換せず直接渡す
export const ContentTypeSchema = z.enum(CONTENT_TYPES);
export const SubmissionTypeSchema = z.enum(SUBMISSION_TYPES);
export const AllowedSubmissionTypeSchema = z.enum(ALLOWED_SUBMISSION_TYPES);
export const CodeLanguageSchema = z.enum(CODE_LANGUAGES);
export const MembershipTypeSchema = z.enum(MEMBERSHIP_TYPES);
export const UserRoleSchema = z.enum(USER_ROLES);
export const BulkContentActionSchema = z.enum(BULK_CONTENT_ACTIONS);

// 既存の `!title` 等の truthy チェックと同じ範囲（空文字のみ拒否）を保つため、
// 前後の空白を除去するトリムは行わない（トリムすると、従来は許可されていた
// 空白のみの文字列が新たに拒否されてしまい、入力検証の置き換えの範囲を超える）
const RequiredStringSchema = z
  .string({ message: "文字列で指定してください" })
  .min(1, { message: "空文字は指定できません" });

/** Markdown本文など、未入力時に null を送る任意項目 */
const OptionalNullableString = z.string().nullable().optional();
const OptionalBoolean = z.boolean().optional();
const OptionalDisplayOrder = z
  .number({ message: "数値で指定してください" })
  .int({ message: "整数で指定してください" })
  .optional();
/**
 * 新規作成フォームの挿入位置。null は「先頭」、数値はその兄弟要素IDの直後を表す。
 * 同じ親配下の未削除要素であることの検証（別の親・削除済み・存在しないID）はスキーマでは
 * 行わず、`resolveSiblingResequence()`（`app/lib/content-grouping.ts`）に委ねる。
 */
const InsertAfterIdSchema = PositiveIntSchema.nullable();

// ==================== /api/progress ====================

export const ProgressUpdateSchema = z.object({
  contentId: ContentIdSchema,
  isCompleted: z.boolean({ message: "isCompletedはbooleanで指定してください" }),
});

// ==================== /api/submissions ====================

export const SubmissionCreateSchema = z.object({
  contentId: ContentIdSchema,
  submissionType: SubmissionTypeSchema,
  // 単一/複数ファイルの振り分け・後方互換のcodeContentフォールバック・URLのtrimと空値判定は
  // 学習コンテンツ固有の業務ロジックのため、型検証はここでは行わずroute側の既存ロジックに委ねる
  codeContent: z.unknown().optional(),
  codeFiles: z.unknown().optional(),
  url: z.unknown().optional(),
});

// ==================== /api/ai-review ====================

export const AiReviewRequestSchema = z.object({
  submissionId: PositiveIntSchema,
});

// ==================== /api/admin/users ====================

const AdminUserBaseSchema = z.object({ userId: UserIdSchema });

/**
 * actionごとに必須項目が異なるため discriminatedUnion で表現する
 * （approve/change_membership は membershipType 必須、change_role は role 必須、reject は追加項目なし）。
 * `Record<UserManagementAction, ...>` にすることで、USER_MANAGEMENT_ACTIONS に含まれる
 * action を network 漏れなく網羅していることをコンパイル時に保証しつつ、実際に
 * discriminatedUnion へ渡す配列自体は USER_MANAGEMENT_ACTIONS から導出する
 * （action文字列そのものをここで再度ハードコードしない）
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

// ==================== /api/manage/themes ====================

// POST（新規作成）は挿入位置（insert_after_id）、PUT（更新）は引き続き display_order を
// 受け取る。編集フォームの挿入位置UI化は別イシューで扱うため、Updateは Create からの
// .partial() 派生ではなく、共通項目（ThemeBaseSchema）に display_order を足して定義する。
const ThemeBaseSchema = z.object({
  name: RequiredStringSchema,
  description: OptionalNullableString,
  is_published: OptionalBoolean,
  image_url: OptionalNullableString,
});
export const ThemeCreateSchema = ThemeBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const ThemeUpdateSchema = ThemeBaseSchema.extend({
  display_order: OptionalDisplayOrder,
}).partial();

// ==================== /api/manage/phases ====================

const PhaseBaseSchema = z.object({
  theme_id: PositiveIntSchema,
  name: RequiredStringSchema,
  description: OptionalNullableString,
  is_published: OptionalBoolean,
});
export const PhaseCreateSchema = PhaseBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const PhaseUpdateSchema = PhaseBaseSchema.extend({
  display_order: OptionalDisplayOrder,
}).partial();

// ==================== /api/manage/weeks ====================

const WeekBaseSchema = z.object({
  phase_id: PositiveIntSchema,
  name: RequiredStringSchema,
  description: OptionalNullableString,
  is_published: OptionalBoolean,
});
export const WeekCreateSchema = WeekBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const WeekUpdateSchema = WeekBaseSchema.extend({
  display_order: OptionalDisplayOrder,
}).partial();

// ==================== /api/manage/contents ====================

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
  // DBのCHECK制約がNOT NULL（既定値あり）のため、他の任意項目と異なりnullは許容しない
  allowed_submission_types: AllowedSubmissionTypeSchema.optional(),
  code_language: CodeLanguageSchema.optional(),
  pdf_url: OptionalNullableString,
  is_published: OptionalBoolean,
  is_open_to_trial: OptionalBoolean,
});
export const ContentCreateSchema = ContentBaseSchema.extend({
  insert_after_id: InsertAfterIdSchema,
});
export const ContentUpdateSchema = ContentBaseSchema.extend({
  display_order: OptionalDisplayOrder,
}).partial();

// ==================== /api/manage/contents/bulk ====================

const BULK_CONTENT_IDS_MESSAGE = `idsは1〜${MAX_BULK_CONTENT_IDS}件の正の整数で指定してください`;

export const BulkContentUpdateSchema = z.object({
  ids: z
    .array(PositiveIntSchema, { message: BULK_CONTENT_IDS_MESSAGE })
    .min(1, { message: BULK_CONTENT_IDS_MESSAGE })
    .max(MAX_BULK_CONTENT_IDS, { message: BULK_CONTENT_IDS_MESSAGE }),
  action: BulkContentActionSchema,
  // set_type アクションの時だけ必須、というaction依存の相関チェックは既存の buildPatch() に残す
  // （値そのものの妥当性は buildPatch() 側で isContentType() により検証されるため、ここでは受け取るだけ）
  contentType: z.unknown().optional(),
});

// ==================== validateRequest ヘルパー ====================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

/**
 * リクエストボディをJSONとしてパースし、schemaで検証する。
 * JSONパース失敗・スキーマ検証失敗のいずれも400・統一形式（{ error: string }）で返す。
 * 呼び出し側は success を見て、失敗時は response をそのまま return するだけでよい。
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

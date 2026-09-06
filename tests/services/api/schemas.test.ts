import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES } from "@/app/components/code-editor-utils";
import {
  ALLOWED_SUBMISSION_TYPES,
  CONTENT_TYPES,
  MAX_BULK_CONTENT_IDS,
} from "@/app/constants/content";
import { MEMBERSHIP_TYPES, USER_MANAGEMENT_ACTIONS, USER_ROLES } from "@/app/constants/user";
import {
  AdminUserActionSchema,
  AiReviewRequestSchema,
  BulkContentUpdateSchema,
  ContentCreateSchema,
  ContentUpdateSchema,
  PhaseCreateSchema,
  PositiveIntSchema,
  ProgressUpdateSchema,
  SubmissionCreateSchema,
  ThemeCreateSchema,
  ThemeUpdateSchema,
  validateRequest,
  WeekCreateSchema,
} from "@/app/services/api/schemas";

describe("PositiveIntSchema", () => {
  it.each([
    ["未指定", undefined],
    ["文字列", "1"],
    ["0", 0],
    ["負数", -1],
    ["小数", 1.5],
    ["null", null],
  ])("%sは検証エラーになる", (_label, value) => {
    expect(PositiveIntSchema.safeParse(value).success).toBe(false);
  });

  it.each([1, 2, Number.MAX_SAFE_INTEGER])("正の整数 %i は許可される", (value) => {
    expect(PositiveIntSchema.safeParse(value).success).toBe(true);
  });
});

describe("ProgressUpdateSchema", () => {
  it("正常な入力を受理する", () => {
    const result = ProgressUpdateSchema.safeParse({ contentId: 1, isCompleted: true });
    expect(result.success).toBe(true);
  });

  it.each([
    ["未指定", undefined],
    ["文字列", "1"],
    ["0", 0],
    ["負数", -1],
    ["小数", 1.5],
  ])("contentIdが%sの場合は検証エラー", (_label, contentId) => {
    expect(ProgressUpdateSchema.safeParse({ contentId, isCompleted: true }).success).toBe(false);
  });

  it.each([
    ["未指定", undefined],
    ["文字列", "true"],
  ])("isCompletedが%sの場合は検証エラー", (_label, isCompleted) => {
    expect(ProgressUpdateSchema.safeParse({ contentId: 1, isCompleted }).success).toBe(false);
  });
});

describe("SubmissionCreateSchema", () => {
  it("code提出の最小構成を受理する", () => {
    const result = SubmissionCreateSchema.safeParse({
      contentId: 1,
      submissionType: "code",
      codeContent: "console.log(1)",
    });
    expect(result.success).toBe(true);
  });

  it("url提出の最小構成を受理する", () => {
    const result = SubmissionCreateSchema.safeParse({
      contentId: 1,
      submissionType: "url",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  it("submissionTypeが許可値以外の場合は検証エラー", () => {
    const result = SubmissionCreateSchema.safeParse({ contentId: 1, submissionType: "file" });
    expect(result.success).toBe(false);
  });

  it("submissionType未指定の場合は検証エラー", () => {
    const result = SubmissionCreateSchema.safeParse({ contentId: 1 });
    expect(result.success).toBe(false);
  });
});

describe("AiReviewRequestSchema", () => {
  it("正の整数のsubmissionIdを受理する", () => {
    expect(AiReviewRequestSchema.safeParse({ submissionId: 1 }).success).toBe(true);
  });

  it.each([undefined, "1", 0, -1, 1.5])("submissionIdが%sの場合は検証エラー", (submissionId) => {
    expect(AiReviewRequestSchema.safeParse({ submissionId }).success).toBe(false);
  });
});

describe("AdminUserActionSchema", () => {
  it("approveはmembershipTypeが必須", () => {
    expect(AdminUserActionSchema.safeParse({ userId: 1, action: "approve" }).success).toBe(false);
    expect(
      AdminUserActionSchema.safeParse({
        userId: 1,
        action: "approve",
        membershipType: MEMBERSHIP_TYPES[0],
      }).success
    ).toBe(true);
  });

  it("approveのmembershipTypeが許可値以外なら検証エラー", () => {
    expect(
      AdminUserActionSchema.safeParse({
        userId: 1,
        action: "approve",
        membershipType: "premium",
      }).success
    ).toBe(false);
  });

  it("change_roleはroleが必須", () => {
    expect(AdminUserActionSchema.safeParse({ userId: 1, action: "change_role" }).success).toBe(
      false
    );
    expect(
      AdminUserActionSchema.safeParse({
        userId: 1,
        action: "change_role",
        role: USER_ROLES[0],
      }).success
    ).toBe(true);
  });

  it("change_roleのroleが許可値以外なら検証エラー", () => {
    expect(
      AdminUserActionSchema.safeParse({ userId: 1, action: "change_role", role: "owner" }).success
    ).toBe(false);
  });

  it("rejectは追加項目なしで受理される", () => {
    expect(AdminUserActionSchema.safeParse({ userId: 1, action: "reject" }).success).toBe(true);
  });

  it("change_membershipはmembershipTypeが必須", () => {
    expect(
      AdminUserActionSchema.safeParse({ userId: 1, action: "change_membership" }).success
    ).toBe(false);
  });

  it("actionが許可値以外なら検証エラー", () => {
    expect(AdminUserActionSchema.safeParse({ userId: 1, action: "delete" }).success).toBe(false);
  });

  it("受理するactionはUSER_MANAGEMENT_ACTIONSから導出され、それ以外は含まない", () => {
    const validBodies: Record<string, unknown> = {
      approve: { userId: 1, action: "approve", membershipType: MEMBERSHIP_TYPES[0] },
      reject: { userId: 1, action: "reject" },
      change_role: { userId: 1, action: "change_role", role: USER_ROLES[0] },
      change_membership: {
        userId: 1,
        action: "change_membership",
        membershipType: MEMBERSHIP_TYPES[0],
      },
    };

    for (const action of USER_MANAGEMENT_ACTIONS) {
      expect(AdminUserActionSchema.safeParse(validBodies[action]).success).toBe(true);
    }
    expect(Object.keys(validBodies).sort()).toEqual([...USER_MANAGEMENT_ACTIONS].sort());
  });

  it.each([undefined, "1", 0, -1, 1.5])("userIdが%sの場合は検証エラー", (userId) => {
    expect(AdminUserActionSchema.safeParse({ userId, action: "reject" }).success).toBe(false);
  });
});

describe("ThemeCreateSchema / ThemeUpdateSchema", () => {
  it("nameとinsert_after_idが必須", () => {
    expect(ThemeCreateSchema.safeParse({}).success).toBe(false);
    expect(ThemeCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(ThemeCreateSchema.safeParse({ name: "テーマ1" }).success).toBe(false);
    expect(ThemeCreateSchema.safeParse({ name: "テーマ1", insert_after_id: null }).success).toBe(
      true
    );
  });

  it("nameは既存の !name チェックと同じ範囲（空文字のみ拒否）で、空白のみの文字列は許容する", () => {
    expect(ThemeCreateSchema.safeParse({ name: "  ", insert_after_id: null }).success).toBe(true);
  });

  it("Updateは全項目が任意で、空オブジェクトも受理する（insert_after_id省略時は表示順を変更しない）", () => {
    const result = ThemeUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("unreachable");
    expect(result.data.insert_after_id).toBeUndefined();
  });

  it("Updateはinsert_after_idを任意項目として受け付ける（null・正の整数のいずれも可）", () => {
    expect(ThemeUpdateSchema.safeParse({ insert_after_id: null }).success).toBe(true);
    expect(ThemeUpdateSchema.safeParse({ insert_after_id: 1 }).success).toBe(true);
    expect(ThemeUpdateSchema.safeParse({ insert_after_id: 0 }).success).toBe(false);
  });

  it("Updateでもnameを指定する場合は空文字を許容しない", () => {
    expect(ThemeUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("image_urlはnullを許容する", () => {
    expect(
      ThemeCreateSchema.safeParse({ name: "テーマ1", insert_after_id: null, image_url: null })
        .success
    ).toBe(true);
  });

  it("insert_after_idはnullまたは正の整数、0以下・小数・文字列は検証エラー", () => {
    expect(ThemeCreateSchema.safeParse({ name: "テーマ1", insert_after_id: null }).success).toBe(
      true
    );
    expect(ThemeCreateSchema.safeParse({ name: "テーマ1", insert_after_id: 1 }).success).toBe(true);
    expect(ThemeCreateSchema.safeParse({ name: "テーマ1", insert_after_id: 0 }).success).toBe(
      false
    );
    expect(ThemeCreateSchema.safeParse({ name: "テーマ1", insert_after_id: 1.5 }).success).toBe(
      false
    );
    expect(ThemeCreateSchema.safeParse({ name: "テーマ1", insert_after_id: "1" }).success).toBe(
      false
    );
  });

  it("insert_after_id未指定の場合は他の数値項目と同じ日本語メッセージを返す", () => {
    const result = ThemeCreateSchema.safeParse({ name: "テーマ1" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.error.issues.map((i) => i.message)).toContain("数値で指定してください");
  });
});

describe("PhaseCreateSchema", () => {
  it("theme_id・name・insert_after_idが必須", () => {
    expect(PhaseCreateSchema.safeParse({ name: "フェーズ1", insert_after_id: null }).success).toBe(
      false
    );
    expect(PhaseCreateSchema.safeParse({ theme_id: 1, insert_after_id: null }).success).toBe(false);
    expect(PhaseCreateSchema.safeParse({ theme_id: 1, name: "フェーズ1" }).success).toBe(false);
    expect(
      PhaseCreateSchema.safeParse({ theme_id: 1, name: "フェーズ1", insert_after_id: null }).success
    ).toBe(true);
  });

  it("theme_idが正の整数以外なら検証エラー", () => {
    expect(
      PhaseCreateSchema.safeParse({ theme_id: 0, name: "フェーズ1", insert_after_id: null }).success
    ).toBe(false);
  });
});

describe("WeekCreateSchema", () => {
  it("phase_id・name・insert_after_idが必須", () => {
    expect(WeekCreateSchema.safeParse({ name: "週1", insert_after_id: null }).success).toBe(false);
    expect(
      WeekCreateSchema.safeParse({ phase_id: 1, name: "週1", insert_after_id: null }).success
    ).toBe(true);
    expect(WeekCreateSchema.safeParse({ phase_id: 1, name: "週1" }).success).toBe(false);
  });
});

describe("ContentCreateSchema / ContentUpdateSchema", () => {
  it("title・week_id・content_type・insert_after_idが必須", () => {
    expect(ContentCreateSchema.safeParse({}).success).toBe(false);
    expect(
      ContentCreateSchema.safeParse({ title: "コンテンツ1", week_id: 1, insert_after_id: null })
        .success
    ).toBe(false);
    expect(
      ContentCreateSchema.safeParse({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "video",
      }).success
    ).toBe(false);
    expect(
      ContentCreateSchema.safeParse({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "video",
        insert_after_id: null,
      }).success
    ).toBe(true);
  });

  it.each(CONTENT_TYPES)("content_typeの許可値 %s を受理する", (content_type) => {
    expect(
      ContentCreateSchema.safeParse({
        title: "コンテンツ1",
        week_id: 1,
        content_type,
        insert_after_id: null,
      }).success
    ).toBe(true);
  });

  it("content_typeが許可値以外の場合は検証エラー（DBのCHECK制約違反による500を未然に防ぐ）", () => {
    expect(
      ContentCreateSchema.safeParse({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "quiz",
        insert_after_id: null,
      }).success
    ).toBe(false);
  });

  it.each(ALLOWED_SUBMISSION_TYPES)("allowed_submission_typesの許可値 %s を受理する", (value) => {
    expect(
      ContentCreateSchema.safeParse({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "exercise",
        allowed_submission_types: value,
        insert_after_id: null,
      }).success
    ).toBe(true);
  });

  it.each(CODE_LANGUAGES)("code_languageの許可値 %s を受理する", (value) => {
    expect(
      ContentCreateSchema.safeParse({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "exercise",
        code_language: value,
        insert_after_id: null,
      }).success
    ).toBe(true);
  });

  it("description等のMarkdown任意項目はnullを許容する（未入力時の送信形式）", () => {
    const result = ContentCreateSchema.safeParse({
      title: "コンテンツ1",
      week_id: 1,
      content_type: "video",
      description: null,
      video_url: null,
      insert_after_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("allowed_submission_types・code_languageはDBがNOT NULLのためnullを許容しない", () => {
    expect(
      ContentCreateSchema.safeParse({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "exercise",
        allowed_submission_types: null,
        insert_after_id: null,
      }).success
    ).toBe(false);
    expect(
      ContentCreateSchema.safeParse({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "exercise",
        code_language: null,
        insert_after_id: null,
      }).success
    ).toBe(false);
  });

  it("insert_after_idはnullまたは正の整数、0以下・小数は検証エラー", () => {
    const base = { title: "コンテンツ1", week_id: 1, content_type: "video" as const };
    expect(ContentCreateSchema.safeParse({ ...base, insert_after_id: 2 }).success).toBe(true);
    expect(ContentCreateSchema.safeParse({ ...base, insert_after_id: 0 }).success).toBe(false);
    expect(ContentCreateSchema.safeParse({ ...base, insert_after_id: 1.5 }).success).toBe(false);
  });

  it("Updateは全項目が任意で、空オブジェクトも受理する（insert_after_id省略時は表示順を変更しない）", () => {
    const result = ContentUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("unreachable");
    expect(result.data.insert_after_id).toBeUndefined();
  });

  it("Updateはinsert_after_idを任意項目として受け付ける（null・正の整数のいずれも可）", () => {
    expect(ContentUpdateSchema.safeParse({ insert_after_id: null }).success).toBe(true);
    expect(ContentUpdateSchema.safeParse({ insert_after_id: 2 }).success).toBe(true);
    expect(ContentUpdateSchema.safeParse({ insert_after_id: 0 }).success).toBe(false);
  });
});

describe("BulkContentUpdateSchema", () => {
  it("idsが空配列の場合は検証エラー", () => {
    expect(BulkContentUpdateSchema.safeParse({ ids: [], action: "publish" }).success).toBe(false);
  });

  it("idsに0以下・小数を含む場合は検証エラー", () => {
    expect(BulkContentUpdateSchema.safeParse({ ids: [1, -1], action: "publish" }).success).toBe(
      false
    );
  });

  it(`idsがちょうど${MAX_BULK_CONTENT_IDS}件なら許可される`, () => {
    const ids = Array.from({ length: MAX_BULK_CONTENT_IDS }, (_, i) => i + 1);
    expect(BulkContentUpdateSchema.safeParse({ ids, action: "publish" }).success).toBe(true);
  });

  it(`idsが${MAX_BULK_CONTENT_IDS}件を超える場合は検証エラー`, () => {
    const ids = Array.from({ length: MAX_BULK_CONTENT_IDS + 1 }, (_, i) => i + 1);
    expect(BulkContentUpdateSchema.safeParse({ ids, action: "publish" }).success).toBe(false);
  });

  it("actionが許可値以外の場合は検証エラー", () => {
    expect(BulkContentUpdateSchema.safeParse({ ids: [1], action: "archive" }).success).toBe(false);
  });
});

describe("validateRequest", () => {
  const jsonRequest = (body: unknown) =>
    new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("スキーマに合致する場合はsuccess:trueでdataを返す", async () => {
    const result = await validateRequest(
      jsonRequest({ contentId: 1, isCompleted: true }),
      ProgressUpdateSchema
    );
    expect(result).toEqual({ success: true, data: { contentId: 1, isCompleted: true } });
  });

  it("スキーマに合致しない場合は400の統一形式（{ error: string }）を返す", async () => {
    const result = await validateRequest(jsonRequest({ contentId: "1" }), ProgressUpdateSchema);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("不正なJSON（パース不能）の場合も400を返す", async () => {
    const malformed = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });

    const result = await validateRequest(malformed, ProgressUpdateSchema);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.response.status).toBe(400);
  });

  it("ボディがnullの場合も400を返す", async () => {
    const nullBody = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });

    const result = await validateRequest(nullBody, ProgressUpdateSchema);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.response.status).toBe(400);
  });
});

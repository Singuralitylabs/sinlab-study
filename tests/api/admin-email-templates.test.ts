import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/email-templates-server");
vi.mock("@/app/services/notifications/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/notifications/email")>()),
  sendEmail: vi.fn(),
}));

import { PUT as putBranding } from "@/app/api/admin/email-templates/branding/route";
import { POST as postPreview } from "@/app/api/admin/email-templates/preview/route";
import { DELETE, GET, PUT } from "@/app/api/admin/email-templates/route";
import { POST as postTestSend } from "@/app/api/admin/email-templates/test-send/route";
import { DEFAULT_EMAIL_TEXTS } from "@/app/lib/email-template";
import {
  claimTestSend,
  fetchEmailTemplatesForAdmin,
  loadEmailTextsWithDraft,
  resetEmailTemplate,
  updateEmailBranding,
  upsertEmailTemplate,
} from "@/app/services/api/email-templates-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { sendEmail } from "@/app/services/notifications/email";

const ADMIN_EMAIL = "admin@example.com";

const authAs = (overrides: Record<string, unknown> = {}) =>
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid", email: ADMIN_EMAIL },
    userId: 1,
    userStatus: "active",
    userRole: "admin",
    ...overrides,
  } as never);

const json = (method: string, body: unknown, path = "") =>
  new Request(`http://localhost/api/admin/email-templates${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const draft = (overrides: Record<string, unknown> = {}) => ({
  template_key: "approved",
  subject: "承認しました",
  body: "会員種別: {{membership_label}}",
  ...overrides,
});

const put = (body: unknown) => PUT(json("PUT", body));
const preview = (body: unknown) => postPreview(json("POST", body, "/preview"));
const testSend = (body: unknown) => postTestSend(json("POST", body, "/test-send"));
const branding = (body: unknown) => putBranding(json("PUT", body, "/branding"));
const del = (key: string) =>
  DELETE(
    new Request(`http://localhost/api/admin/email-templates?template_key=${key}`, {
      method: "DELETE",
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  authAs();
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@mail.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://study.example.com");
  vi.mocked(fetchEmailTemplatesForAdmin).mockResolvedValue({
    data: { templates: [], editorNames: {}, branding: {} } as never,
    error: null,
  });
  vi.mocked(upsertEmailTemplate).mockResolvedValue({ error: null });
  vi.mocked(resetEmailTemplate).mockResolvedValue({ error: null });
  vi.mocked(updateEmailBranding).mockResolvedValue({ error: null, updated: true });
  vi.mocked(loadEmailTextsWithDraft).mockImplementation(async (key, text, brandingDraft) => ({
    branding: brandingDraft ?? DEFAULT_EMAIL_TEXTS.branding,
    templates: { [key]: text },
  }));
  vi.mocked(claimTestSend).mockResolvedValue({ allowed: true, release: vi.fn() });
  vi.mocked(sendEmail).mockResolvedValue({ status: "sent", messageId: "msg" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const CALLS: Array<[string, () => Promise<Response>]> = [
  ["GET", () => GET()],
  ["PUT", () => put(draft())],
  ["DELETE", () => del("approved")],
  ["branding PUT", () => branding({ service_name: "名前", service_subtitle: "" })],
  ["preview POST", () => preview(draft())],
  ["test-send POST", () => testSend(draft())],
];

function expectNothingHappened() {
  expect(fetchEmailTemplatesForAdmin).not.toHaveBeenCalled();
  expect(upsertEmailTemplate).not.toHaveBeenCalled();
  expect(resetEmailTemplate).not.toHaveBeenCalled();
  expect(updateEmailBranding).not.toHaveBeenCalled();
  expect(loadEmailTextsWithDraft).not.toHaveBeenCalled();
  expect(claimTestSend).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
}

describe("/api/admin/email-templates - 権限", () => {
  it.each(CALLS)("%s: 未認証は401で、何も読み書き・送信しない", async (_name, call) => {
    authAs({ user: null, userId: null, userStatus: null, userRole: null });

    const res = await call();

    expect(res.status).toBe(401);
    expectNothingHappened();
  });

  it.each(["maintainer", "member"])("%s は403（全エンドポイント）", async (role) => {
    authAs({ userRole: role });

    for (const [, call] of CALLS) {
      expect((await call()).status).toBe(403);
    }
    expectNothingHappened();
  });

  it.each(CALLS)("%s: 拒否済み（rejected）の元 admin は403", async (_name, call) => {
    authAs({ userStatus: "rejected" });

    expect((await call()).status).toBe(403);
    expectNothingHappened();
  });
});

describe("PUT /api/admin/email-templates - 入力検証", () => {
  it("正常な値は保存する（保存者は admin 本人）", async () => {
    const res = await put(draft());

    expect(res.status).toBe(200);
    expect(upsertEmailTemplate).toHaveBeenCalledWith(
      "approved",
      { subject: "承認しました", body: "会員種別: {{membership_label}}" },
      1
    );
  });

  it("template_key は既定値の定義にあるキーのみ", async () => {
    for (const key of ["unknown", "trial_nurture", "trial_nurture.day3", "", 1]) {
      expect((await put(draft({ template_key: key }))).status).toBe(400);
    }
    expect(
      (
        await put(
          draft({ template_key: "trial_nurture.day14", body: "{{elapsed_label}}が経ちました" })
        )
      ).status
    ).toBe(200);
    expect(upsertEmailTemplate).toHaveBeenCalledTimes(1);
  });

  it("件名: 1〜100文字で、改行は不可（境界値）", async () => {
    expect((await put(draft({ subject: "" }))).status).toBe(400);
    expect((await put(draft({ subject: "   " }))).status).toBe(400);
    expect((await put(draft({ subject: "あ".repeat(100) }))).status).toBe(200);
    expect((await put(draft({ subject: "あ".repeat(101) }))).status).toBe(400);
    for (const subject of ["a\nb", "a\r\nb", "a\rb", "a b", "a b", "a\nBcc: x@y.z"]) {
      expect((await put(draft({ subject }))).status, JSON.stringify(subject)).toBe(400);
    }
    expect(upsertEmailTemplate).toHaveBeenCalledTimes(1);
  });

  it("本文: 1〜5,000文字（境界値）", async () => {
    expect((await put(draft({ body: "" }))).status).toBe(400);
    expect((await put(draft({ body: " \n " }))).status).toBe(400);
    expect((await put(draft({ body: "あ".repeat(5000) }))).status).toBe(200);
    expect((await put(draft({ body: "あ".repeat(5001) }))).status).toBe(400);
  });

  it("許可リストに無いプレースホルダーは400で、どれが使えないかを返す", async () => {
    const res = await put(
      draft({ subject: "{{secret}}", body: "{{monthly_price}} {{membership_label}}" })
    );

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain("{{monthly_price}}");
    expect(error).toContain("{{secret}}");
    expect(error).not.toContain("{{membership_label}}");
    expect(upsertEmailTemplate).not.toHaveBeenCalled();
  });

  it("お知らせは本文に {{announcement_body}} が1つだけ必要で、件名には使えない", async () => {
    const announcement = { template_key: "announcement", subject: "お知らせ: {{title}}" };
    expect((await put({ ...announcement, body: "前置きだけ" })).status).toBe(400);
    expect(
      (await put({ ...announcement, body: "{{announcement_body}}{{announcement_body}}" })).status
    ).toBe(400);
    expect(
      (
        await put({
          ...announcement,
          subject: "{{announcement_body}}",
          body: "{{announcement_body}}",
        })
      ).status
    ).toBe(400);
    expect((await put({ ...announcement, body: "前\n\n{{announcement_body}}\n\n後" })).status).toBe(
      200
    );
  });

  it("未知のフィールド（宛先など）は受け付けない", async () => {
    expect((await put(draft({ to: "someone@example.com" }))).status).toBe(400);
    expect(upsertEmailTemplate).not.toHaveBeenCalled();
  });

  it("DB エラーは500（詳細は返さない）", async () => {
    vi.mocked(upsertEmailTemplate).mockResolvedValue({
      error: { message: "secret detail" } as never,
    });

    const res = await put(draft());

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});

describe("DELETE /api/admin/email-templates（既定に戻す）", () => {
  it("許可キーなら行を削除する", async () => {
    expect((await del("trial_nurture.day2")).status).toBe(200);
    expect(resetEmailTemplate).toHaveBeenCalledWith("trial_nurture.day2");
  });

  it("キーが不正・未指定なら400", async () => {
    expect((await del("nope")).status).toBe(400);
    expect((await DELETE(new Request("http://localhost/api/admin/email-templates"))).status).toBe(
      400
    );
    expect(resetEmailTemplate).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/email-templates/branding - サービス名", () => {
  it("サービス名 1〜50文字・補足 0〜100文字で、どちらも改行不可（境界値）", async () => {
    expect((await branding({ service_name: "", service_subtitle: "" })).status).toBe(400);
    expect((await branding({ service_name: "あ".repeat(50), service_subtitle: "" })).status).toBe(
      200
    );
    expect((await branding({ service_name: "あ".repeat(51), service_subtitle: "" })).status).toBe(
      400
    );
    expect((await branding({ service_name: "A\nB", service_subtitle: "" })).status).toBe(400);
    expect((await branding({ service_name: "A", service_subtitle: "あ".repeat(100) })).status).toBe(
      200
    );
    expect((await branding({ service_name: "A", service_subtitle: "あ".repeat(101) })).status).toBe(
      400
    );
    expect((await branding({ service_name: "A", service_subtitle: "x\r\ny" })).status).toBe(400);
  });

  it("補足が空なら NULL（補足なし）として保存する", async () => {
    await branding({ service_name: "サービス", service_subtitle: "" });

    expect(updateEmailBranding).toHaveBeenCalledWith(
      { serviceName: "サービス", serviceSubtitle: null },
      1
    );
  });

  it("更新対象の行が無い（RLS で拒否など）と404", async () => {
    vi.mocked(updateEmailBranding).mockResolvedValue({ error: null, updated: false });

    expect((await branding({ service_name: "A", service_subtitle: "" })).status).toBe(404);
  });
});

describe("POST /api/admin/email-templates/preview", () => {
  it("保存前の入力内容で、テキスト版と HTML 版を返し、何も送らない", async () => {
    const res = await preview(
      draft({ subject: "未保存の件名", body: "未保存: {{membership_label}}" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.subject).toBe("【Sinlab Study】未保存の件名");
    expect(data.text).toContain("未保存: コミュニティ会員");
    expect(data.html).toContain("未保存: コミュニティ会員");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(upsertEmailTemplate).not.toHaveBeenCalled();
  });

  it("条件の切り替え: 料金の有無で料金の行が出入りする", async () => {
    const body = {
      template_key: "upgraded",
      subject: "件名",
      body: "料金: {{monthly_price}}\n\n固定",
    };

    const full = await (await preview({ ...body, variant: "full" })).json();
    const noPrice = await (await preview({ ...body, variant: "no_price" })).json();

    expect(full.text).toContain("料金: 月額 1,000 円（税込）");
    expect(noPrice.text).not.toContain("料金:");
    expect(noPrice.text).toContain("固定");
    expect(full.variants.map((v: { id: string }) => v.id)).toEqual(["full", "no_price", "no_date"]);
  });

  it("未保存のサービス名も反映する", async () => {
    const data = await (
      await preview(draft({ service_name: "試しの名前", service_subtitle: "" }))
    ).json();

    expect(data.subject).toBe("【試しの名前】承認しました");
  });

  it("許可リスト外のプレースホルダーは400", async () => {
    expect((await preview(draft({ body: "{{nope}}" }))).status).toBe(400);
  });

  it("配信停止リンクは署名の無いサンプルで、誰の配信も停止できない", async () => {
    const data = await (
      await preview({ template_key: "weekly_digest", subject: "件名", body: "{{weekly_cheer}}" })
    ).json();

    expect(data.text).toContain("/api/email/unsubscribe?token=sample");
  });
});

describe("POST /api/admin/email-templates/test-send", () => {
  it("ログイン中の admin 本人のメールアドレスにだけ送り、件名に【テスト】を付ける", async () => {
    const res = await testSend(draft());

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const params = vi.mocked(sendEmail).mock.calls[0][0];
    expect(params.to).toBe(ADMIN_EMAIL);
    expect(params.subject).toBe("【テスト】【Sinlab Study】承認しました");
    expect(claimTestSend).toHaveBeenCalledWith(1);
  });

  it("宛先をリクエストで指定することはできない（to などは400で、送らない）", async () => {
    for (const extra of [{ to: "victim@example.com" }, { email: "victim@example.com" }]) {
      expect((await testSend(draft(extra))).status).toBe(400);
    }
    expect(sendEmail).not.toHaveBeenCalled();
    expect(claimTestSend).not.toHaveBeenCalled();
  });

  it("本人のメールアドレスを確認できないときは送らない", async () => {
    authAs({ user: { id: "auth-uuid", email: undefined } });

    expect((await testSend(draft())).status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("1日の上限に達していたら429で送らない", async () => {
    vi.mocked(claimTestSend).mockResolvedValue({ allowed: false, error: null });

    const res = await testSend(draft());

    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("上限");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("回数の記録に失敗したときは（上限を数えられないので）送らない", async () => {
    vi.mocked(claimTestSend).mockResolvedValue({
      allowed: false,
      error: "テスト送信の準備に失敗しました",
    });

    expect((await testSend(draft())).status).toBe(503);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("送信に失敗したら、その回数は消費しない", async () => {
    const release = vi.fn();
    vi.mocked(claimTestSend).mockResolvedValue({ allowed: true, release });
    vi.mocked(sendEmail).mockResolvedValue({ status: "failed", error: "status=500" });

    const res = await testSend(draft());

    expect(res.status).toBe(502);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("送信設定が未完了なら503で、回数も消費しない", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    expect((await testSend(draft())).status).toBe(503);
    expect(claimTestSend).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("案内系のテンプレートでも、配信停止リンクとヘッダーを付けて送る（サンプルの URL）", async () => {
    await testSend({ template_key: "weekly_digest", subject: "件名", body: "短い本文" });

    const params = vi.mocked(sendEmail).mock.calls[0][0];
    expect(params.headers?.["List-Unsubscribe"]).toContain("/api/email/unsubscribe?token=sample");
    expect(params.text).toContain("配信を停止できます");
  });
});

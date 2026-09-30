import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, type QueryResult } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { EMAIL_TEST_SEND_DAILY_LIMIT } from "@/app/constants/notifications";
import {
  claimTestSend,
  loadEmailTexts,
  loadEmailTextsWithDraft,
  updateEmailBranding,
  upsertEmailTemplate,
} from "@/app/services/api/email-templates-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

type Client = ReturnType<typeof createMockSupabaseClient>;

const tables = (client: Client) => client.from.mock.calls.map(([name]) => name);
const builder = (client: Client, table: string) =>
  client.from.mock.results[tables(client).indexOf(table)].value;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function admin(tableResults: Record<string, QueryResult | QueryResult[]>) {
  const client = createMockSupabaseClient({ tableResults });
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);
  return client;
}

describe("loadEmailTexts（DB → 既定値、フェイルセーフ）", () => {
  const asAdmin = (client: Client) => client as unknown as Parameters<typeof loadEmailTexts>[0];

  it("行が無ければ既定のサービス名・補足で、上書きなし", async () => {
    const texts = await loadEmailTexts(
      asAdmin(
        admin({
          email_settings: { data: null, error: null },
          email_templates: { data: [], error: null },
        })
      )
    );

    expect(texts.branding).toEqual({
      serviceName: "Sinlab Study",
      serviceSubtitle: "AIと学ぶ実践Web技術講座",
    });
    expect(texts.templates).toEqual({});
  });

  it("保存された行を読み、未知のキーは無視する。補足の NULL は「補足なし」として保つ", async () => {
    const texts = await loadEmailTexts(
      asAdmin(
        admin({
          email_settings: {
            data: { service_name: " 新名称 ", service_subtitle: null },
            error: null,
          },
          email_templates: {
            data: [
              { template_key: "approved", subject: "件名", body: "本文" },
              { template_key: "not_a_key", subject: "x", body: "y" },
            ],
            error: null,
          },
        })
      )
    );

    expect(texts.branding).toEqual({ serviceName: "新名称", serviceSubtitle: null });
    expect(texts.templates).toEqual({ approved: { subject: "件名", body: "本文" } });
  });

  it("サービス名に改行が混ざっていても（DB の直接書き換え）1行にして使う", async () => {
    const texts = await loadEmailTexts(
      asAdmin(
        admin({
          email_settings: {
            data: { service_name: "A\r\nBcc: x", service_subtitle: "" },
            error: null,
          },
          email_templates: { data: [], error: null },
        })
      )
    );

    expect(texts.branding.serviceName).toBe("A Bcc: x");
  });

  it("読み出しが DB エラーなら、それぞれ既定値になる（例外にしない）", async () => {
    const texts = await loadEmailTexts(
      asAdmin(
        admin({
          email_settings: { data: null, error: { message: "down" } },
          email_templates: { data: null, error: { message: "down" } },
        })
      )
    );

    expect(texts.branding.serviceName).toBe("Sinlab Study");
    expect(texts.templates).toEqual({});
  });

  it("読み出しが例外を投げても既定値を返す", async () => {
    const client = createMockSupabaseClient();
    client.from.mockImplementation(() => {
      throw new Error("connection lost");
    });

    const texts = await loadEmailTexts(asAdmin(client));

    expect(texts.branding.serviceName).toBe("Sinlab Study");
    expect(texts.templates).toEqual({});
  });

  it("1回の呼び出しで、設定とテンプレートを1回ずつ読む", async () => {
    const client = admin({
      email_settings: { data: null, error: null },
      email_templates: { data: [], error: null },
    });

    await loadEmailTexts(asAdmin(client));

    expect(tables(client).sort()).toEqual(["email_settings", "email_templates"]);
  });
});

describe("loadEmailTextsWithDraft（プレビュー用）", () => {
  it("保存済みの文面の上に、未保存の入力を重ねる", async () => {
    admin({
      email_settings: { data: null, error: null },
      email_templates: {
        data: [{ template_key: "signup", subject: "保存済み", body: "保存済み" }],
        error: null,
      },
    });

    const texts = await loadEmailTextsWithDraft("approved", { subject: "下書き", body: "下書き" });

    expect(texts.templates).toEqual({
      signup: { subject: "保存済み", body: "保存済み" },
      approved: { subject: "下書き", body: "下書き" },
    });
  });
});

describe("claimTestSend（テスト送信の1日の上限）", () => {
  function adminWithRpc(
    rpcResult: QueryResult,
    tableResults: Record<string, QueryResult | QueryResult[]> = {}
  ) {
    const client = createMockSupabaseClient({
      tableResults,
      rpcResults: { claim_email_test_send: rpcResult },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);
    return client;
  }

  it("枠を確保できたら許可する。上限・日の開始・本人の id を渡し、email_logs には一切触れない", async () => {
    const client = adminWithRpc({ data: 5, error: null });

    const claim = await claimTestSend(1, new Date("2026-10-05T03:00:00Z"));

    expect(claim.allowed).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("claim_email_test_send", {
      p_user_id: 1,
      p_day_start: "2026-10-04T15:00:00.000Z",
      p_limit: EMAIL_TEST_SEND_DAILY_LIMIT,
    });
    expect(tables(client)).not.toContain("email_logs");
  });

  it("枠が無い（関数が NULL を返す）と、エラー無しで拒否する", async () => {
    adminWithRpc({ data: null, error: null });

    expect(await claimTestSend(1)).toEqual({ allowed: false, error: null });
  });

  it("関数の呼び出しに失敗したら（上限を数えられないので）拒否する", async () => {
    adminWithRpc({ data: null, error: { message: "down" } });

    const claim = await claimTestSend(1);

    expect(claim.allowed).toBe(false);
    expect(claim).toMatchObject({ error: expect.any(String) });
  });

  it("例外が出ても拒否し、伝播しない", async () => {
    vi.mocked(createAdminSupabaseClient).mockRejectedValue(new Error("no env"));

    expect((await claimTestSend(1)).allowed).toBe(false);
  });

  it("送信に失敗したときの release は、確保した行だけを消す", async () => {
    const client = adminWithRpc(
      { data: 9, error: null },
      { email_test_sends: { data: null, error: null } }
    );

    const claim = await claimTestSend(1);
    if (!claim.allowed) throw new Error("allowed のはず");
    await claim.release();

    expect(builder(client, "email_test_sends").delete).toHaveBeenCalled();
    expect(builder(client, "email_test_sends").eq).toHaveBeenCalledWith("id", 9);
  });
});

describe("upsertEmailTemplate（admin の通常クライアント = RLS 適用）", () => {
  it("service_role ではなく、ログイン中の管理者のクライアントで書き込む", async () => {
    const server = createMockSupabaseClient({
      tableResults: { email_templates: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(server as never);

    const result = await upsertEmailTemplate("approved", { subject: "件名", body: "本文" }, 3);

    expect(result.error).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(builder(server, "email_templates").upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        template_key: "approved",
        subject: "件名",
        body: "本文",
        updated_by: 3,
      }),
      { onConflict: "template_key" }
    );
  });
});

describe("updateEmailBranding（1日の上限の最終更新と分ける）", () => {
  it("サービス名専用の列だけを更新し、上限の updated_at / updated_by には触れない", async () => {
    const server = createMockSupabaseClient({
      tableResults: { email_settings: { data: [{ id: 1 }], error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(server as never);

    const result = await updateEmailBranding({ serviceName: "名前", serviceSubtitle: null }, 3);

    expect(result).toEqual({ error: null, updated: true });
    const payload = builder(server, "email_settings").update.mock.calls[0][0];
    expect(payload).toEqual({
      service_name: "名前",
      service_subtitle: null,
      service_updated_at: expect.any(String),
      service_updated_by: 3,
    });
    expect(payload).not.toHaveProperty("updated_at");
    expect(payload).not.toHaveProperty("updated_by");
  });
});

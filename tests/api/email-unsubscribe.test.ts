import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { GET, POST } from "@/app/api/email/unsubscribe/route";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { createUnsubscribeToken } from "@/app/services/notifications/email-unsubscribe";

function mockAdmin(result = { data: null, error: null as unknown }) {
  const client = createMockSupabaseClient({ tableResults: { users: result } });
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);
  return client;
}

function request(token: string | null, method = "GET") {
  const url = new URL("https://study.example.com/api/email/unsubscribe");
  if (token !== null) {
    url.searchParams.set("token", token);
  }
  return new NextRequest(url, { method });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "unsubscribe-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/email/unsubscribe（確認画面）", () => {
  it("正しいトークンなら確認画面（POST のボタン）を返し、GET では配信停止を確定しない", async () => {
    const client = mockAdmin();
    const token = createUnsubscribeToken(42) as string;

    const res = await GET(request(token));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain('<form method="post"');
    expect(body).toContain(`action="?token=${encodeURIComponent(token)}"`);
    expect(body).toContain("配信を停止する");
    // メールのセキュリティ製品によるリンクの先読み（GET）で停止しない
    expect(client.from).not.toHaveBeenCalled();
  });

  it("トークンの改ざん・欠落は 400 を返す", async () => {
    const client = mockAdmin();
    const token = createUnsubscribeToken(42) as string;

    for (const bad of [null, "", `43.${token.split(".")[1]}`, "42.invalid"]) {
      const res = await GET(request(bad));
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("リンクが無効です");
      expect(body).not.toContain("<form");
    }
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("POST /api/email/unsubscribe（確定。確認画面のボタンと RFC 8058 のワンクリック配信停止）", () => {
  it("正しいトークンなら email_opt_out_at を記録し、完了画面を返す", async () => {
    const client = mockAdmin();

    const res = await POST(request(createUnsubscribeToken(42), "POST"));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("配信を停止しました");
    const builder = client.from.mock.results[0].value;
    expect(client.from).toHaveBeenCalledWith("users");
    expect(builder.update).toHaveBeenCalledWith({ email_opt_out_at: expect.any(String) });
    expect(builder.eq).toHaveBeenCalledWith("id", 42);
    // 既に停止済みなら日時を上書きしない（更新0行でも成功扱い）
    expect(builder.is).toHaveBeenCalledWith("email_opt_out_at", null);
  });

  it("トークンの改ざん・欠落は 400 を返し、DB を更新しない", async () => {
    const client = mockAdmin();
    const token = createUnsubscribeToken(42) as string;

    for (const bad of [null, "", `43.${token.split(".")[1]}`, "42.invalid"]) {
      const res = await POST(request(bad, "POST"));
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("リンクが無効です");
      expect(body).not.toContain("43");
    }
    expect(client.from).not.toHaveBeenCalled();
  });

  it("EMAIL_UNSUBSCRIBE_SECRET が未設定なら 400 を返し、DB を更新しない（フェイルクローズ）", async () => {
    const token = createUnsubscribeToken(42);
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    const client = mockAdmin();

    const res = await POST(request(token, "POST"));

    expect(res.status).toBe(400);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("DB エラーは 500 を返す（内容は画面に出さない）", async () => {
    mockAdmin({ data: null, error: { message: "db down" } });

    const res = await POST(request(createUnsubscribeToken(42), "POST"));

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("db down");
  });
});

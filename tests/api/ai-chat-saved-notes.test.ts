import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");

import { DELETE, POST } from "@/app/api/ai-chat/saved-notes/route";
import { AI_CHAT_SAVED_NOTES_MAX_PER_USER } from "@/app/constants/ai-chat";
import { isContentVisible } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "trial",
  userRole: "member",
};

const request = (method: string, body: unknown) =>
  new Request("http://localhost/api/ai-chat/saved-notes", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const valid = { contentId: 10, question: "質問", answer: "回答" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_CHAT_ENABLED", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(isContentVisible).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/ai-chat/saved-notes", () => {
  it("無効なら 503", async () => {
    vi.stubEnv("AI_CHAT_ENABLED", "");
    expect((await POST(request("POST", valid))).status).toBe(503);
  });

  it("見られないコンテンツは 403", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(createMockSupabaseClient() as never);
    vi.mocked(isContentVisible).mockResolvedValue(false);
    expect((await POST(request("POST", valid))).status).toBe(403);
  });

  it(`${AI_CHAT_SAVED_NOTES_MAX_PER_USER} 件に達していたら 409`, async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        ai_chat_saved_notes: { data: null, error: null, count: AI_CHAT_SAVED_NOTES_MAX_PER_USER },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    expect((await POST(request("POST", valid))).status).toBe(409);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("本人の user_id で保存する（お試しも可）", async () => {
    const saved = { id: 1, content_id: 10, question: "質問", answer: "回答", created_at: "x" };
    const client = createMockSupabaseClient({
      tableResults: {
        ai_chat_saved_notes: [
          { data: null, error: null, count: 3 },
          { data: saved, error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    const res = await POST(request("POST", valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ note: saved });
    const insertBuilder = client.from.mock.results[1].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      user_id: 2,
      content_id: 10,
      question: "質問",
      answer: "回答",
    });
  });

  it("回答が長すぎると 400", async () => {
    expect((await POST(request("POST", { ...valid, answer: "a".repeat(2001) }))).status).toBe(400);
  });
});

describe("DELETE /api/ai-chat/saved-notes", () => {
  it("本人の行が無ければ 404", async () => {
    const client = createMockSupabaseClient({
      tableResults: { ai_chat_saved_notes: { data: [], error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    expect((await DELETE(request("DELETE", { id: 5 }))).status).toBe(404);
    const builder = client.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("user_id", 2);
  });

  it("機能が無効でも削除はできる", async () => {
    vi.stubEnv("AI_CHAT_ENABLED", "");
    const client = createMockSupabaseClient({
      tableResults: { ai_chat_saved_notes: { data: [{ id: 5 }], error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    expect((await DELETE(request("DELETE", { id: 5 }))).status).toBe(200);
  });
});

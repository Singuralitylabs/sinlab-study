import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@vercel/analytics/server", () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

import { track } from "@vercel/analytics/server";
import { POST } from "@/app/api/submissions/route";
import {
  EMPTY_SUBMISSION_FILE_ERROR,
  SUBMISSION_FILE_SLOTS_MISMATCH_ERROR,
} from "@/app/lib/submission-file-slots";
import { fetchVisibleContentForSubmission } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const request = (
  body: unknown = { contentId: 1, submissionType: "code", codeContent: "console.log(1)" }
) =>
  new Request("http://localhost/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const visibleContent = {
  code_language: "javascript",
  submission_file_slots: null,
  starter_files: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue(visibleContent as never);
  vi.mocked(createServerSupabaseClient).mockResolvedValue(
    createMockSupabaseClient({
      tableResults: { submissions: { data: { id: 1 }, error: null } },
    }) as never
  );
});

describe("POST /api/submissions - 認可", () => {
  it("未認証は401を返し、DBクライアントを取得しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(401);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejected ユーザーは403を返し、DBクライアントを取得しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("対象コンテンツが不可視の場合は403", async () => {
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue(null);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
  });
});

describe("POST /api/submissions - バリデーション", () => {
  it.each([
    ["未指定", undefined],
    ["文字列", "1"],
    ["0", 0],
    ["負数", -1],
    ["小数", 1.5],
  ])("contentIdが%sの場合は400", async (_label, contentId) => {
    const res = await POST(
      request({ contentId, submissionType: "code", codeContent: "console.log(1)" }) as never
    );

    expect(res.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/submissions - 認証ユーザーIDでの書き込み", () => {
  it.each([
    [
      "userIdを送らない場合",
      { contentId: 1, submissionType: "code", codeContent: "console.log(1)" },
    ],
    [
      "他人になりすます userId を送っても無視される場合",
      { contentId: 1, userId: 999, submissionType: "code", codeContent: "console.log(1)" },
    ],
  ])("%s、認証ユーザーのIDでINSERTし200を返す", async (_label, body) => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);

    const res = await POST(request(body) as never);

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: memberAuth.userId, content_id: 1 })
    );
  });
});

describe("POST /api/submissions - first_submission", () => {
  it("提出が無いときだけ status を付けて送る", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          submissions: [
            { data: null, error: null, count: 0 },
            { data: { id: 1 }, error: null },
          ],
        },
      }) as never
    );

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("first_submission", { status: "active" });
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("@");
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("user_id");
  });

  it("既に提出があるときは送らない", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          submissions: [
            { data: null, error: null, count: 3 },
            { data: { id: 2 }, error: null },
          ],
        },
      }) as never
    );

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(track).not.toHaveBeenCalled();
  });

  it("track が拒否しても提出レスポンスは変わらない", async () => {
    vi.mocked(track).mockRejectedValueOnce(new Error("analytics down"));

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.submission).toEqual({ id: 1 });
  });
});

describe("POST /api/submissions - 単一ファイルの保存形式", () => {
  it("language/filename があるときは code_files に保存する", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);

    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      ...visibleContent,
      code_language: "javascript",
      submission_file_slots: [{ filename: "page.html", language: "html" }],
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [{ filename: "page.html", language: "html", content: "<div></div>" }],
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        code_content: null,
        code_files: [{ filename: "page.html", language: "html", content: "<div></div>" }],
      })
    );
  });

  it("language/filename が空の1ファイルは code_content に保存する（既存挙動）", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [{ filename: "", language: "", content: "const x = 1;" }],
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        code_content: "const x = 1;",
        code_files: null,
      })
    );
  });
});

describe("POST /api/submissions - 未編集の初期コード", () => {
  const starter = [{ filename: "index.html", language: "html", content: "<div></div>" }];

  it("starter と同一（末尾空白のみ）なら 400", async () => {
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      starter_files: starter,
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [{ filename: "index.html", language: "html", content: "<div></div>\n" }],
      }) as never
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "初期コードから変更してください" });
    expect(fetchVisibleContentForSubmission).toHaveBeenCalledTimes(1);
  });

  it("ファイル名だけ変えても 400", async () => {
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      starter_files: starter,
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [{ filename: "main.html", language: "html", content: "<div></div>" }],
      }) as never
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR });
  });

  it("内容を変えていれば 200", async () => {
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      starter_files: starter,
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [{ filename: "index.html", language: "html", content: "<div>edited</div>" }],
      }) as never
    );

    expect(res.status).toBe(200);
  });
});

describe("POST /api/submissions - 提出ファイル構成", () => {
  it("構成未指定で初期コードに空ファイルがあるときは、空を除いて保存する", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      ...visibleContent,
      code_language: "javascript",
      submission_file_slots: null,
      starter_files: [
        { filename: "page.html", language: "html", content: "<p>" },
        { filename: "style.css", language: "css", content: "" },
      ],
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [
          { filename: "page.html", language: "html", content: "<div>edited</div>" },
          { filename: "style.css", language: "css", content: "" },
        ],
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        code_content: null,
        code_files: [{ filename: "page.html", language: "html", content: "<div>edited</div>" }],
      })
    );
  });

  it("空にしたあとに残ったファイルが初期コードのままなら 400", async () => {
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      ...visibleContent,
      code_language: "html",
      submission_file_slots: null,
      starter_files: [
        { filename: "index.html", language: "html", content: "<p>" },
        { filename: "style.css", language: "css", content: "body{}" },
      ],
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [
          { filename: "index.html", language: "html", content: "<p>" },
          { filename: "style.css", language: "css", content: "" },
        ],
      }) as never
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "初期コードから変更してください" });
  });

  it("空ファイルを外しても残りの中身を変えていれば保存する", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      ...visibleContent,
      code_language: "javascript",
      submission_file_slots: null,
      starter_files: [
        { filename: "page.html", language: "html", content: "<p>" },
        { filename: "style.css", language: "css", content: "body{}" },
      ],
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [
          { filename: "page.html", language: "html", content: "<div>edited</div>" },
          { filename: "style.css", language: "css", content: "" },
        ],
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        code_content: null,
        code_files: [{ filename: "page.html", language: "html", content: "<div>edited</div>" }],
      })
    );
  });

  it("空のファイルは 400", async () => {
    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [{ filename: "code.js", language: "javascript", content: "  " }],
      }) as never
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: EMPTY_SUBMISSION_FILE_ERROR });
  });

  it("ファイル名・言語・並び順が構成と違うと 400", async () => {
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      ...visibleContent,
      code_language: "html",
      submission_file_slots: [
        { filename: "index.html", language: "html" },
        { filename: "main.js", language: "javascript" },
      ],
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [
          { filename: "main.js", language: "javascript", content: "run()" },
          { filename: "index.html", language: "html", content: "<p></p>" },
        ],
      }) as never
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR });
  });

  it("構成どおりの複数ファイルは code_files に保存する", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);
    vi.mocked(fetchVisibleContentForSubmission).mockResolvedValue({
      ...visibleContent,
      code_language: "html",
      submission_file_slots: [
        { filename: "index.html", language: "html" },
        { filename: "main.js", language: "javascript" },
      ],
    } as never);

    const files = [
      { filename: "index.html", language: "html", content: "<p></p>" },
      { filename: "main.js", language: "javascript", content: "run()" },
    ];
    const res = await POST(
      request({ contentId: 1, submissionType: "code", codeFiles: files }) as never
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ code_content: null, code_files: files })
    );
  });

  it("空の codeFiles と codeContent は既定1ファイルとして code_content に保存する", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [],
        codeContent: "console.log(1)",
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ code_content: "console.log(1)", code_files: null })
    );
  });

  it("未指定の演習は code_language の既定ファイル名でも code_content に保存する", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);

    const res = await POST(
      request({
        contentId: 1,
        submissionType: "code",
        codeFiles: [{ filename: "code.js", language: "javascript", content: "const x = 1;" }],
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ code_content: "const x = 1;", code_files: null })
    );
  });
});

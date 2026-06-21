import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/api-auth");
vi.mock("@/app/services/api/gemini");
vi.mock("@/app/services/api/ai-review-server");

import { POST } from "@/app/api/ai-review/route";
import {
  updateAIReviewCompleted,
  updateAIReviewProcessing,
  upsertPendingAIReview,
} from "@/app/services/api/ai-review-server";
import { generateReview } from "@/app/services/api/gemini";
import { getApiAuth, getApiSupabaseClient } from "@/app/services/auth/api-auth";

// Supabase クエリビルダーのテスト用実装
// select/eq/in/gte/limit チェーンと直接 await（thenable）の両方に対応
function qb(result: Record<string, unknown>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    // biome-ignore lint/suspicious/noThenProperty: Supabase クエリビルダーの thenable を再現するため意図的に定義
    then: (
      onfulfilled: (v: Record<string, unknown>) => unknown,
      onrejected?: (r: unknown) => unknown,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected: (r: unknown) => unknown) => Promise.resolve(result).catch(onrejected),
    finally: (onfinally: () => void) => Promise.resolve(result).finally(onfinally),
  };
}

// from() 呼び出し順に対応した結果を返すモッククライアントを生成する
// ルートコード内の from() 呼び出し順序に合わせて引数を渡す
function makeClient(...fromResults: Record<string, unknown>[]) {
  const mock = { from: vi.fn() };
  for (const result of fromResults) {
    mock.from.mockReturnValueOnce(qb(result));
  }
  return mock;
}

const MOCK_SUBMISSION = {
  id: 1,
  user_id: 10,
  content_id: 100,
  submission_type: "code",
  code_content: null,
  // code_files を使うことで getSubmissionCodeFiles が正しい CodeFile[] を返す
  code_files: [
    { filename: "index.js", language: "javascript", content: "function add(a,b){return a+b;}" },
  ],
  url: null,
  content: {
    id: 100,
    exercise_instructions: "加算関数を実装してください",
    reference_answer: null,
  },
};

const MOCK_REVIEW_RESULT = {
  reviewContent: "良いコードです。\n**総合スコア: 90/100**",
  overallScore: 90,
  modelUsed: "gemini-2.5-flash",
  promptTokens: 100,
  completionTokens: 200,
};

function makeRequest(submissionId: number) {
  return new NextRequest("http://localhost/api/ai-review", {
    method: "POST",
    body: JSON.stringify({ submissionId }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/ai-review", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.mocked(getApiAuth).mockResolvedValue({
      success: true,
      data: { userId: 10, authId: "test-auth-id" },
    });
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  describe("月次利用上限チェック", () => {
    // ルート内 from() 呼び出し順（月次上限到達時）:
    // 1. from("submissions")...single()        → 提出データ
    // 2. from("submissions")...               → 全提出ID（月次カウント用）
    // 3. from("ai_reviews")...count            → ai_reviews カウント = 20（→ 429）

    it("月次20件に達している場合、429と日本語エラーを返す", async () => {
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: MOCK_SUBMISSION, error: null },
          { data: [{ id: 1 }], error: null },
          { count: 20, data: null, error: null },
        ) as never,
      );

      const res = await POST(makeRequest(1));
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.error).toContain("20回");
      expect(body.error).toContain("来月以降");
      expect(vi.mocked(generateReview)).not.toHaveBeenCalled();
    });

    // ルート内 from() 呼び出し順（19件 = 上限未達）:
    // 1. 提出データ → 2. 全提出ID → 3. カウント19 → 4. 同コンテンツ提出なし → generateReview

    it("月次19件の場合は上限チェックを通過し generateReview を呼ぶ", async () => {
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: MOCK_SUBMISSION, error: null },
          { data: [{ id: 1 }], error: null },
          { count: 19, data: null, error: null },
          { data: [], error: null }, // 同コンテンツ提出なし → activeReview チェックをスキップ
        ) as never,
      );
      vi.mocked(upsertPendingAIReview).mockResolvedValue({ id: 1 } as never);
      vi.mocked(updateAIReviewProcessing).mockResolvedValue({ id: 1 } as never);
      vi.mocked(generateReview).mockResolvedValue(MOCK_REVIEW_RESULT);
      vi.mocked(updateAIReviewCompleted).mockResolvedValue(undefined);

      const res = await POST(makeRequest(1));

      expect(res.status).toBe(200);
      expect(vi.mocked(generateReview)).toHaveBeenCalledOnce();
    });

    // 提出が0件のユーザー（新規ユーザー等）は ai_reviews カウントクエリ自体をスキップする。
    // ルート内 from() 呼び出し順:
    // 1. 提出データ → 2. 全提出ID空（→ カウントスキップ）→ 3. 同コンテンツ提出なし → generateReview

    it("提出が0件の場合、月次カウントをスキップして generateReview を呼ぶ", async () => {
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: MOCK_SUBMISSION, error: null },
          { data: [], error: null }, // 全提出ID空 → カウントをスキップ
          { data: [], error: null }, // 同コンテンツ提出なし
        ) as never,
      );
      vi.mocked(upsertPendingAIReview).mockResolvedValue({ id: 1 } as never);
      vi.mocked(updateAIReviewProcessing).mockResolvedValue({ id: 1 } as never);
      vi.mocked(generateReview).mockResolvedValue(MOCK_REVIEW_RESULT);
      vi.mocked(updateAIReviewCompleted).mockResolvedValue(undefined);

      const res = await POST(makeRequest(1));

      expect(res.status).toBe(200);
      expect(vi.mocked(generateReview)).toHaveBeenCalledOnce();
    });
  });

  describe("1課題1回制限チェック", () => {
    // ルート内 from() 呼び出し順（既存レビューあり）:
    // 1. 提出データ → 2. 全提出ID → 3. カウント5 → 4. 同コンテンツ提出あり → 5. activeReview（→ 429）

    it("同一コンテンツで completed レビューがある場合、429 を返す", async () => {
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: MOCK_SUBMISSION, error: null },
          { data: [{ id: 1 }], error: null },
          { count: 5, data: null, error: null },
          { data: [{ id: 1 }], error: null }, // 同コンテンツの提出あり
          { data: { id: 99, status: "completed", submission_id: 2 }, error: null }, // 既存レビュー
        ) as never,
      );

      const res = await POST(makeRequest(1));
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.error).toContain("1回のみ");
      expect(vi.mocked(generateReview)).not.toHaveBeenCalled();
    });
  });
});

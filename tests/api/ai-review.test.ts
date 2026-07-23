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
import { createMockSupabaseClientFromSequence } from "@/tests/helpers/supabase-mock";

// from() 呼び出し順に対応した結果を返すモッククライアントを生成する
// ルートコード内の from() 呼び出し順序に合わせて引数を渡す
const makeClient = createMockSupabaseClientFromSequence;

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
    // 2. from("ai_reviews")...count            → submissions を join した月次カウント = 20（→ 429）

    it("月次20件に達している場合、429と日本語エラーを返す", async () => {
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: MOCK_SUBMISSION, error: null },
          { count: 20, data: null, error: null }
        ) as never
      );

      const res = await POST(makeRequest(1));
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.error).toContain("20回");
      expect(body.error).toContain("来月以降");
      expect(vi.mocked(generateReview)).not.toHaveBeenCalled();
    });

    // ルート内 from() 呼び出し順（19件 = 上限未達）:
    // 1. 提出データ → 2. カウント19 → 3. 同コンテンツ提出なし → generateReview

    it("月次19件の場合は上限チェックを通過し generateReview を呼ぶ", async () => {
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: MOCK_SUBMISSION, error: null },
          { count: 19, data: null, error: null },
          { data: [], error: null } // 同コンテンツ提出なし → activeReview チェックをスキップ
        ) as never
      );
      vi.mocked(upsertPendingAIReview).mockResolvedValue({ id: 1 } as never);
      vi.mocked(updateAIReviewProcessing).mockResolvedValue({ id: 1 } as never);
      vi.mocked(generateReview).mockResolvedValue(MOCK_REVIEW_RESULT);
      vi.mocked(updateAIReviewCompleted).mockResolvedValue(true);

      const res = await POST(makeRequest(1));

      expect(res.status).toBe(200);
      expect(vi.mocked(generateReview)).toHaveBeenCalledOnce();
    });
  });

  describe("ヒント連携", () => {
    // ルート内 from() 呼び出し順（19件 = 上限未達、同コンテンツ提出なし）:
    // 1. 提出データ → 2. カウント19 → 3. 同コンテンツ提出なし → generateReview

    it("content.hint がある場合、generateReview の第4引数に渡す", async () => {
      const submissionWithHint = {
        ...MOCK_SUBMISSION,
        content: { ...MOCK_SUBMISSION.content, hint: "配列の合計にはreduceを使うとよい" },
      };
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: submissionWithHint, error: null },
          { count: 19, data: null, error: null },
          { data: [], error: null }
        ) as never
      );
      vi.mocked(upsertPendingAIReview).mockResolvedValue({ id: 1 } as never);
      vi.mocked(updateAIReviewProcessing).mockResolvedValue({ id: 1 } as never);
      vi.mocked(generateReview).mockResolvedValue(MOCK_REVIEW_RESULT);
      vi.mocked(updateAIReviewCompleted).mockResolvedValue(true);

      await POST(makeRequest(1));

      expect(vi.mocked(generateReview)).toHaveBeenCalledWith(
        submissionWithHint.content.exercise_instructions,
        expect.anything(),
        submissionWithHint.content.reference_answer,
        "配列の合計にはreduceを使うとよい"
      );
    });

    it("content.hint がない場合、generateReview の第4引数に undefined を渡す", async () => {
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: MOCK_SUBMISSION, error: null },
          { count: 19, data: null, error: null },
          { data: [], error: null }
        ) as never
      );
      vi.mocked(upsertPendingAIReview).mockResolvedValue({ id: 1 } as never);
      vi.mocked(updateAIReviewProcessing).mockResolvedValue({ id: 1 } as never);
      vi.mocked(generateReview).mockResolvedValue(MOCK_REVIEW_RESULT);
      vi.mocked(updateAIReviewCompleted).mockResolvedValue(true);

      await POST(makeRequest(1));

      expect(vi.mocked(generateReview)).toHaveBeenCalledWith(
        MOCK_SUBMISSION.content.exercise_instructions,
        expect.anything(),
        MOCK_SUBMISSION.content.reference_answer,
        undefined
      );
    });
  });

  describe("1課題1回制限チェック", () => {
    // ルート内 from() 呼び出し順（既存レビューあり）:
    // 1. 提出データ → 2. カウント5 → 3. 同コンテンツ提出あり → 4. activeReview（→ 429）

    it("同一コンテンツで completed レビューがある場合、429 を返す", async () => {
      vi.mocked(getApiSupabaseClient).mockResolvedValue(
        makeClient(
          { data: MOCK_SUBMISSION, error: null },
          { count: 5, data: null, error: null },
          { data: [{ id: 1 }], error: null }, // 同コンテンツの提出あり
          { data: { id: 99, status: "completed", submission_id: 2 }, error: null } // 既存レビュー
        ) as never
      );

      const res = await POST(makeRequest(1));
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.error).toContain("1回のみ");
      expect(vi.mocked(generateReview)).not.toHaveBeenCalled();
    });
  });
});

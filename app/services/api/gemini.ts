import { ApiError, GoogleGenAI } from "@google/genai";
import { CODE_LANGUAGES, type CodeLanguage } from "@/app/components/code-editor-utils";
import {
  GEMINI_API_KEY_ENV,
  GEMINI_API_KEY_TRIAL_ENV,
  GEMINI_MAX_CODE_LENGTH,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_MAX_RETRIES,
  GEMINI_MODEL_NAME,
  GEMINI_REQUEST_TIMEOUT_MS,
  GEMINI_RETRY_BASE_DELAY_MS,
  GEMINI_THINKING_LEVEL,
  GEMINI_TOTAL_BUDGET_MS,
} from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";
import type { CodeFile, UserStatusType } from "@/app/types";

export const SYSTEM_PROMPT = `Web技術講座のAI採点アシスタントです。以下の形式で簡潔にレビューしてください（日本語・初学者向け・建設的に）。

## 1. 要件達成度
各要件を「達成 / 部分的 / 未達成」で判定。

## 2. コード品質・可読性
構造・命名・ベストプラクティスを簡潔に評価。

## 3. 改善提案（最大2つ）
要点のみ。コード例は必要な場合のみ。

## 4. 学習アドバイス
次のステップを1〜2文で。

## 5. 総合スコア
**総合スコア: XX/100**`;

const OVERALL_SCORE_PATTERN = /総合スコア:\s*(\d+)\s*\/\s*100/;

interface ReviewResult {
  reviewContent: string;
  overallScore: number | null;
  modelUsed: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export type ReviewSubmission =
  | { type: "url"; content: string }
  | { type: "code"; files: CodeFile[] };

export interface GenerateReviewParams {
  exerciseInstructions: string;
  submission: ReviewSubmission;
  referenceAnswer?: string | null;
  apiKey: string;
}

/**
 * Picks the key by userStatus: active uses GEMINI_API_KEY; trial uses GEMINI_API_KEY_TRIAL,
 * falling back to the member key; anything else (rejected / null) yields undefined (caller
 * returns 403).
 */
export function resolveGeminiApiKey(userStatus: UserStatusType | null): string | undefined {
  const memberKey = process.env[GEMINI_API_KEY_ENV];
  if (userStatus === USER_STATUS.ACTIVE) {
    return memberKey || undefined;
  }
  if (userStatus === USER_STATUS.TRIAL) {
    return process.env[GEMINI_API_KEY_TRIAL_ENV] || memberKey || undefined;
  }
  return undefined;
}

function buildCodeSection(files: CodeFile[]): string {
  if (files.length === 1 && !files[0].filename) {
    const content = files[0].content;
    const truncated =
      content.length > GEMINI_MAX_CODE_LENGTH
        ? `${content.substring(0, GEMINI_MAX_CODE_LENGTH)}\n\n... (${content.length - GEMINI_MAX_CODE_LENGTH}文字省略)`
        : content;
    // language comes from the submission body unchecked; anything outside the known list could
    // carry spaces, newlines or backticks and break the fence, so it is dropped.
    const fenceLanguage = CODE_LANGUAGES.includes(files[0].language as CodeLanguage)
      ? files[0].language
      : "";
    return `\`\`\`${fenceLanguage}\n${truncated}\n\`\`\``;
  }

  return files
    .map((file, index) => {
      const name = file.filename || `ファイル${index + 1}`;
      const header = file.language ? `${name} (${file.language})` : name;
      return `### ${header}\n\`\`\`\n${file.content}\n\`\`\``;
    })
    .join("\n\n");
}

export function buildUserPrompt(
  exerciseInstructions: string,
  submission: ReviewSubmission,
  referenceAnswer?: string | null
): string {
  const referenceSection = referenceAnswer ? `\n## 模範回答\n${referenceAnswer}\n` : "";

  if (submission.type === "url") {
    return `## 課題内容
${exerciseInstructions}
${referenceSection}
## 提出内容（URL）
${submission.content}

※ URL提出のため、URLの内容を直接確認することはできません。URL形式の妥当性と、課題要件への適合性（URLの構造やドメインから推測できる範囲）のみ評価してください。`;
  }

  return `## 課題内容
${exerciseInstructions}
${referenceSection}
## 提出コード
${buildCodeSection(submission.files)}`;
}

export function extractOverallScore(reviewContent: string): number | null {
  const scoreMatch = reviewContent.match(OVERALL_SCORE_PATTERN);
  return scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null;
}

export function isRateLimitError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

/**
 * Whether the error came from config.abortSignal (AbortSignal.timeout()/any()).
 * The SDK wraps the caller's signal in its own AbortController and calls `controller.abort()`
 * without a reason, so the observed error is normally DOMException "AbortError" (not
 * "TimeoutError"). Callers pass only the timeout signal, so AbortError can be treated as a
 * timeout. Both names are accepted in case a future SDK lets reasoned aborts ("TimeoutError")
 * through.
 * This relies on private @google/genai internals: re-verify after SDK upgrades.
 */
export function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

export function redactApiKey(text: string, apiKey: string): string {
  if (!apiKey || !text.includes(apiKey)) {
    return text;
  }
  return text.split(apiKey).join("[redacted]");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSafeError(error: unknown, apiKey: string): Error {
  if (error instanceof Error) {
    return new Error(redactApiKey(error.message, apiKey));
  }
  return new Error(
    error
      ? redactApiKey(String(error), apiKey)
      : "Gemini APIリクエスト中に不明なエラーが発生しました。"
  );
}

export async function generateReview({
  exerciseInstructions,
  submission,
  referenceAnswer,
  apiKey,
}: GenerateReviewParams): Promise<ReviewResult> {
  if (!apiKey) {
    throw new Error("Gemini APIキーが設定されていません");
  }

  const ai = new GoogleGenAI({ apiKey });
  const userPrompt = buildUserPrompt(exerciseInstructions, submission, referenceAnswer);

  let lastError: unknown;

  // Cap the total of all attempts plus retry waits at GEMINI_TOTAL_BUDGET_MS even if each attempt
  // waits close to GEMINI_REQUEST_TIMEOUT_MS instead of failing fast on 429 (maxDuration guard).
  const deadlineAt = Date.now() + GEMINI_TOTAL_BUDGET_MS;
  const overallSignal = AbortSignal.timeout(GEMINI_TOTAL_BUDGET_MS);

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          thinkingConfig: {
            thinkingLevel: GEMINI_THINKING_LEVEL,
          },
          abortSignal: AbortSignal.any([
            AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
            overallSignal,
          ]),
        },
      });

      const reviewContent = response.text ?? "";
      if (!reviewContent.trim()) {
        throw new Error("Gemini APIからレビュー結果を取得できませんでした");
      }
      const usageMetadata = response.usageMetadata;

      return {
        reviewContent,
        overallScore: extractOverallScore(reviewContent),
        modelUsed: GEMINI_MODEL_NAME,
        promptTokens: usageMetadata?.promptTokenCount ?? null,
        completionTokens: usageMetadata?.candidatesTokenCount ?? null,
      };
    } catch (error) {
      lastError = error;

      const delay = GEMINI_RETRY_BASE_DELAY_MS * 2 ** attempt;
      if (
        isRateLimitError(error) &&
        attempt < GEMINI_MAX_RETRIES &&
        Date.now() + delay < deadlineAt
      ) {
        console.warn(
          `Gemini APIレート制限 (試行 ${attempt + 1}/${GEMINI_MAX_RETRIES + 1})、${delay}ms後にリトライ`
        );
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  if (isRateLimitError(lastError)) {
    throw new Error(
      "Gemini APIの利用上限に達しました。しばらく時間を置いてから再試行してください。"
    );
  }

  if (isTimeoutError(lastError)) {
    throw new Error(
      "Gemini APIの応答がタイムアウトしました。しばらく時間を置いてから再試行してください。"
    );
  }

  throw toSafeError(lastError, apiKey);
}

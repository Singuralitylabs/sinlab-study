import { ApiError, GoogleGenAI } from "@google/genai";
import {
  GEMINI_API_KEY_ENV,
  GEMINI_API_KEY_TRIAL_ENV,
  GEMINI_MAX_CODE_LENGTH,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_MAX_RETRIES,
  GEMINI_MODEL_NAME,
  GEMINI_RETRY_BASE_DELAY_MS,
  GEMINI_THINKING_BUDGET,
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

/**
 * AIレビュー対象の提出内容。
 * - url: URL提出（1件）
 * - code: コード提出（単一/複数ファイル）
 */
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
 * userStatus に応じて Gemini API キーを返す。
 * - active: 会員用（`GEMINI_API_KEY`）。未設定なら undefined
 * - pending: お試し用（`GEMINI_API_KEY_TRIAL`）。未設定なら会員用へフォールバック
 * - それ以外（rejected / null 等）: undefined（呼び出し側で 403 等を返す）
 */
export function resolveGeminiApiKey(userStatus: UserStatusType | null): string | undefined {
  const memberKey = process.env[GEMINI_API_KEY_ENV];
  if (userStatus === USER_STATUS.ACTIVE) {
    return memberKey || undefined;
  }
  if (userStatus === USER_STATUS.PENDING) {
    return process.env[GEMINI_API_KEY_TRIAL_ENV] || memberKey || undefined;
  }
  return undefined;
}

/**
 * コードファイル群をプロンプト用のコードセクションに整形する。
 * - 単一ファイル（ファイル名なし）: 従来どおりコードフェンスのみ
 * - 複数ファイル: ファイル名・言語のヘッダー付きで各ファイルをフェンス表示
 */
function buildCodeSection(files: CodeFile[]): string {
  if (files.length === 1 && !files[0].filename) {
    const content = files[0].content;
    const truncated =
      content.length > GEMINI_MAX_CODE_LENGTH
        ? `${content.substring(0, GEMINI_MAX_CODE_LENGTH)}\n\n... (${content.length - GEMINI_MAX_CODE_LENGTH}文字省略)`
        : content;
    return `\`\`\`\n${truncated}\n\`\`\``;
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

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          thinkingConfig: {
            thinkingBudget: GEMINI_THINKING_BUDGET,
          },
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

      if (isRateLimitError(error) && attempt < GEMINI_MAX_RETRIES) {
        const delay = GEMINI_RETRY_BASE_DELAY_MS * 2 ** attempt;
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

  throw toSafeError(lastError, apiKey);
}

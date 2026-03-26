import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.5-flash";
const MAX_CODE_LENGTH = 8000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 5000;

const SYSTEM_PROMPT = `Web技術講座のAI採点アシスタントです。以下の形式で簡潔にレビューしてください（日本語・初学者向け・建設的に）。

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

interface ReviewResult {
  reviewContent: string;
  overallScore: number | null;
  modelUsed: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("429") || error.message.includes("Too Many Requests");
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateReview(
  exerciseInstructions: string,
  submissionContent: string,
  submissionType: "code" | "url",
  referenceAnswer?: string | null
): Promise<ReviewResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 1500,
      // gemini-2.5-flash は思考モデルのため、thinking tokens が出力トークン枠を消費する。
      // レビュータスクには思考不要なので無効化してレスポンス出力に全トークンを確保する。
      // @ts-expect-error: thinkingConfig は @google/generative-ai@0.24.1 の型定義に未追加だがランタイムでは有効
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  });

  const referenceSection = referenceAnswer ? `\n## 模範回答\n${referenceAnswer}\n` : "";

  let userPrompt: string;
  if (submissionType === "url") {
    userPrompt = `## 課題内容
${exerciseInstructions}
${referenceSection}
## 提出内容（URL）
${submissionContent}

※ URL提出のため、URLの内容を直接確認することはできません。URL形式の妥当性と、課題要件への適合性（URLの構造やドメインから推測できる範囲）のみ評価してください。`;
  } else {
    const truncated =
      submissionContent.length > MAX_CODE_LENGTH
        ? `${submissionContent.substring(0, MAX_CODE_LENGTH)}\n\n... (${submissionContent.length - MAX_CODE_LENGTH}文字省略)`
        : submissionContent;

    userPrompt = `## 課題内容
${exerciseInstructions}
${referenceSection}
## 提出コード
\`\`\`
${truncated}
\`\`\``;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(userPrompt);
      const response = result.response;
      const reviewContent = response.text();

      const scoreMatch = reviewContent.match(/総合スコア:\s*(\d+)\s*\/\s*100/);
      const overallScore = scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null;

      const usageMetadata = response.usageMetadata;

      return {
        reviewContent,
        overallScore,
        modelUsed: MODEL_NAME,
        promptTokens: usageMetadata?.promptTokenCount ?? null,
        completionTokens: usageMetadata?.candidatesTokenCount ?? null,
      };
    } catch (error) {
      lastError = error;

      if (isRateLimitError(error) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
        console.warn(
          `Gemini APIレート制限 (試行 ${attempt + 1}/${MAX_RETRIES + 1})、${delay}ms後にリトライ`
        );
        await sleep(delay);
        continue;
      }

      // レート制限以外のエラー or リトライ上限到達
      break;
    }
  }

  // エラーメッセージを分かりやすく変換
  if (isRateLimitError(lastError)) {
    throw new Error(
      "Gemini APIの利用上限に達しました。しばらく時間を置いてから再試行してください。"
    );
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(
    lastError ? String(lastError) : "Gemini APIリクエスト中に不明なエラーが発生しました。"
  );
}

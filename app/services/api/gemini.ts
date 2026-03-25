import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.5-flash";
const MAX_CODE_LENGTH = 50000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 5000;

const SYSTEM_PROMPT = `あなたはWeb技術講座のAI講師アシスタントです。受講生が提出した課題をレビューし、学習を促進するフィードバックを提供してください。

以下の5つのセクションでMarkdown形式のレビューを生成してください：

## 1. 要件達成度
課題の各要件について、以下のいずれかで判定してください：
- **達成**: 要件を満たしている
- **部分的**: 一部満たしているが改善の余地がある
- **未達成**: 要件を満たしていない

## 2. コード品質・可読性
コードの構造、命名規則、フォーマット、ベストプラクティスの観点から評価してください。

## 3. 改善提案（最大3つ）
具体的なコード例を含めた改善提案を最大3つ提示してください。

## 4. 学習アドバイス
この課題を通じて学ぶべきポイントや、次のステップとして取り組むべきことを提案してください。

## 5. 総合スコア
100点満点で総合スコアを提示してください。フォーマット: **総合スコア: XX/100**

---
フィードバックは建設的で励ましを含むものにしてください。初学者にもわかりやすい日本語で記述してください。`;

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
  submissionType: "code" | "url"
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
      maxOutputTokens: 800,
    },
  });

  let userPrompt: string;
  if (submissionType === "url") {
    userPrompt = `## 課題内容
${exerciseInstructions}

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

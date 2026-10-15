import {
  ApiError,
  type GenerateContentResponse,
  type GenerateContentResponseUsageMetadata,
  GoogleGenAI,
  type Schema,
  Type,
} from "@google/genai";
import type { ZodType } from "zod";
import { CODE_LANGUAGES, type CodeLanguage } from "@/app/components/code-editor-utils";
import {
  GEMINI_API_KEY_ENV,
  GEMINI_API_KEY_TRIAL_ENV,
  GEMINI_MAX_CODE_LENGTH,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_MAX_RETRIES,
  GEMINI_MODEL_CONFIGS,
  GEMINI_REQUEST_TIMEOUT_MS,
  GEMINI_RETRY_BASE_DELAY_MS,
  GEMINI_RETRY_MIN_ATTEMPT_MS,
  GEMINI_RETRYABLE_STATUSES,
  GEMINI_TEMPERATURE,
  GEMINI_THINKING_LEVEL,
  GEMINI_TOTAL_BUDGET_MS,
  GEMINI_VALIDATION_ATTEMPTS,
  type GeminiModelConfig,
} from "@/app/constants/gemini";
import {
  GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS,
  GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS,
  QUALITY_LEVELS,
  REQUIREMENT_STATUSES,
  REVIEW_MAX_SUGGESTIONS,
} from "@/app/constants/grading";
import { USER_STATUS } from "@/app/constants/user";
import { computeReviewScore, isReviewPassed, renderReviewMarkdown } from "@/app/lib/grading";
import {
  buildRubricReviewSchema,
  EstimatedReviewSchema,
  GradingRubricDraftSchema,
  UrlReviewSchema,
} from "@/app/lib/grading-schema";
import { addTokenCount, type TokenUsage } from "@/app/lib/token-usage";
import type { CodeFile, GradingRubric, ReviewJson, ScoreKind, UserStatusType } from "@/app/types";

export const SYSTEM_PROMPT = `Web技術講座のAI採点アシスタントです。提出物を評価し、指定されたJSON形式のみで返してください（日本語・初学者向け・建設的に）。

- 各要件を met（達成）/ partial（部分的）/ unmet（未達成）のいずれかで判定し、根拠を comment に1文で書く
- code_quality.level はコードの構造・命名・ベストプラクティスから good / fair / poor のいずれかで判定し、根拠を comment に書く
- suggestions は改善提案を最大${REVIEW_MAX_SUGGESTIONS}件（要点のみ。コード例は必要な場合のみ）
- advice は次のステップを1〜2文で書く
- 点数・合否・パーセンテージは出力しない（点数はシステムが判定ラベルから計算する）`;

export type { TokenUsage };

export interface ReviewResult extends TokenUsage {
  reviewJson: ReviewJson;
  scoreKind: ScoreKind;
  /** Rubric version used for grading; null unless scoreKind is "rubric". */
  rubricVersion: number | null;
  /** Rendered from reviewJson for display compatibility (ai_reviews.review_content). */
  reviewContent: string;
  overallScore: number | null;
  /** null unless scoreKind is "rubric" and CERTIFICATE_PASS_SCORE is enabled. */
  passed: boolean | null;
  modelUsed: string;
}

/**
 * Carries the tokens already billed so a failed review row can record them (a failed attempt is
 * still charged).
 */
export class ReviewGenerationError extends Error {
  readonly usage: TokenUsage;

  constructor(message: string, usage: TokenUsage) {
    super(message);
    this.name = "ReviewGenerationError";
    this.usage = usage;
  }
}

export type ReviewSubmission =
  | { type: "url"; content: string }
  | { type: "code"; files: CodeFile[] };

export interface GenerateReviewParams {
  exerciseInstructions: string;
  submission: ReviewSubmission;
  referenceAnswer?: string | null;
  gradingRubric?: GradingRubric | null;
  /** Learner-visible starter; when set, the prompt asks the model to focus on changes beyond it. */
  starterFiles?: CodeFile[] | null;
  apiKey: string;
  /**
   * Dry-run only. Pins one model so a fallback does not mix graders in a comparison.
   * Omitted in production, which walks GEMINI_MODEL_CONFIGS.
   */
  modelName?: string;
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

/**
 * A fence longer than any backtick run in the content, so submitted code (a Markdown README with
 * its own ``` blocks, a template literal containing them) cannot close it early and turn the rest
 * into prompt text at the same level as the instructions.
 */
function fenceFor(content: string): string {
  // reduce, not Math.max(...runs): a long submission can have more runs than the argument limit.
  const longestRun = (content.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0
  );
  return "`".repeat(Math.max(3, longestRun + 1));
}

// Applied per file in the multi-file branch too: codeFiles has no length limit at the API, and a
// long README or data file would otherwise go into the prompt whole.
function truncateCode(content: string): string {
  return content.length > GEMINI_MAX_CODE_LENGTH
    ? `${content.substring(0, GEMINI_MAX_CODE_LENGTH)}\n\n... (${content.length - GEMINI_MAX_CODE_LENGTH}文字省略)`
    : content;
}

function buildCodeSection(files: CodeFile[]): string {
  if (files.length === 1 && !files[0].filename) {
    const truncated = truncateCode(files[0].content);
    // language comes from the submission body unchecked; anything outside the known list could
    // carry spaces, newlines or backticks and break the fence, so it is dropped. "gas" is not a
    // Markdown fence language, so it is sent as the JavaScript it is.
    const language = files[0].language === "gas" ? "javascript" : files[0].language;
    const fenceLanguage = CODE_LANGUAGES.includes(language as CodeLanguage) ? language : "";
    const fence = fenceFor(truncated);
    return `${fence}${fenceLanguage}\n${truncated}\n${fence}`;
  }

  return files
    .map((file, index) => {
      const name = file.filename || `ファイル${index + 1}`;
      const header = file.language ? `${name} (${file.language})` : name;
      const content = truncateCode(file.content);
      const fence = fenceFor(content);
      return `### ${header}\n${fence}\n${content}\n${fence}`;
    })
    .join("\n\n");
}

function buildRubricSection(gradingRubric: GradingRubric): string {
  const lines = gradingRubric.requirements.map(
    (requirement) =>
      `- key: ${requirement.key} / 名前: ${requirement.name}${
        requirement.description ? ` / 説明: ${requirement.description}` : ""
      }`
  );
  return `\n## 採点基準（要件）\n${lines.join("\n")}\n\n上記の key をすべて、重複なく、そのままの綴りで requirements に含めて判定してください。key を追加・変更・省略しないでください。\n`;
}

const ESTIMATED_RUBRIC_NOTE = `
## 採点基準
採点基準は未設定です。課題内容と模範回答から要件を${GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS}〜${GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS}件推測し、key（r1, r2, ... の連番）と name（短い要件名）を付けて判定してください。
`;

export function buildUserPrompt(
  exerciseInstructions: string,
  submission: ReviewSubmission,
  referenceAnswer?: string | null,
  gradingRubric?: GradingRubric | null,
  starterFiles?: CodeFile[] | null
): string {
  const referenceSection = referenceAnswer ? `\n## 模範回答\n${referenceAnswer}\n` : "";
  const starterSection =
    starterFiles && starterFiles.length > 0
      ? `\n## 初期コード\n以下は課題に用意された初期コードです。受講生が初期コードから書き足した・変更した部分を中心に評価してください。\n${buildCodeSection(starterFiles)}\n`
      : "";

  if (submission.type === "url") {
    return `## 課題内容
${exerciseInstructions}
${referenceSection}
## 提出内容（URL）
${submission.content}

※ URL提出のため、URLの内容を直接確認することはできません。要件ごとの判定は行わず、URL形式の妥当性と、課題要件への適合性（URLの構造やドメインから推測できる範囲）のみ code_quality.comment・suggestions・advice に書いてください。`;
  }

  const rubricSection = gradingRubric ? buildRubricSection(gradingRubric) : ESTIMATED_RUBRIC_NOTE;

  return `## 課題内容
${exerciseInstructions}
${referenceSection}${rubricSection}${starterSection}
## 提出コード
${buildCodeSection(submission.files)}`;
}

const REVIEW_TEXT_SCHEMA: Schema = { type: Type.STRING };

function buildReviewResponseSchema(mode: ScoreKind, gradingRubric: GradingRubric | null): Schema {
  const body = {
    suggestions: {
      type: Type.ARRAY,
      items: REVIEW_TEXT_SCHEMA,
      maxItems: String(REVIEW_MAX_SUGGESTIONS),
    },
    advice: REVIEW_TEXT_SCHEMA,
  };
  const qualityLevel: Schema = {
    type: Type.STRING,
    enum: [...QUALITY_LEVELS],
  };

  if (mode === "none") {
    return {
      type: Type.OBJECT,
      properties: {
        code_quality: {
          type: Type.OBJECT,
          properties: { comment: REVIEW_TEXT_SCHEMA },
          required: ["comment"],
        },
        ...body,
      },
      required: ["code_quality", "suggestions", "advice"],
    };
  }

  const requirementProperties: Record<string, Schema> = {
    key:
      mode === "rubric" && gradingRubric
        ? { type: Type.STRING, enum: gradingRubric.requirements.map((r) => r.key) }
        : REVIEW_TEXT_SCHEMA,
    status: { type: Type.STRING, enum: [...REQUIREMENT_STATUSES] },
    comment: REVIEW_TEXT_SCHEMA,
  };
  const requirementRequired = ["key", "status", "comment"];
  if (mode === "estimated") {
    requirementProperties.name = REVIEW_TEXT_SCHEMA;
    requirementRequired.push("name");
  }

  const requirements: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: requirementProperties,
      required: requirementRequired,
    },
  };
  if (mode === "rubric" && gradingRubric) {
    requirements.minItems = String(gradingRubric.requirements.length);
    requirements.maxItems = String(gradingRubric.requirements.length);
  }

  return {
    type: Type.OBJECT,
    properties: {
      requirements,
      code_quality: {
        type: Type.OBJECT,
        properties: { level: qualityLevel, comment: REVIEW_TEXT_SCHEMA },
        required: ["level", "comment"],
      },
      ...body,
    },
    required: ["requirements", "code_quality", "suggestions", "advice"],
  };
}

type ParsedReview = { ok: true; reviewJson: ReviewJson } | { ok: false; reason: string };

const EMPTY_RESPONSE_MESSAGE = "Gemini APIからレビュー結果を取得できませんでした";
const INVALID_REVIEW_JSON_MESSAGE = "AIレビューの結果をJSONとして解釈できませんでした";

function describeValidationFailure(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): string {
  const issue = error.issues[0];
  const where = issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : "";
  return `AIレビューの結果の形式が不正でした（${where}${issue.message}）`.slice(0, 200);
}

/** Shared by review parsing and rubric-draft parsing so a new check is not added in only one. */
function parseModelJson<T>(
  text: string | undefined,
  schema: ZodType<T>,
  invalidJsonMessage: string
): { ok: true; data: T } | { ok: false; reason: string } {
  if (!text?.trim()) {
    return { ok: false, reason: EMPTY_RESPONSE_MESSAGE };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: invalidJsonMessage };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, reason: describeValidationFailure(parsed.error) };
}

/**
 * Validates the model's JSON with zod and normalises it. The AI's output never decides the score:
 * only its labels are kept, and for URL submissions the quality level is pinned to "fair".
 */
export function parseReviewResponse(
  text: string | undefined,
  mode: ScoreKind,
  gradingRubric: GradingRubric | null
): ParsedReview {
  if (mode === "none") {
    const parsed = parseModelJson(text, UrlReviewSchema, INVALID_REVIEW_JSON_MESSAGE);
    if (!parsed.ok) {
      return parsed;
    }
    return {
      ok: true,
      reviewJson: {
        requirements: [],
        code_quality: { level: "fair", comment: parsed.data.code_quality.comment },
        suggestions: parsed.data.suggestions,
        advice: parsed.data.advice,
      },
    };
  }

  if (mode === "rubric" && gradingRubric) {
    const parsed = parseModelJson(
      text,
      buildRubricReviewSchema(gradingRubric),
      INVALID_REVIEW_JSON_MESSAGE
    );
    if (!parsed.ok) {
      return parsed;
    }
    const byKey = new Map(parsed.data.requirements.map((item) => [item.key, item]));
    return {
      ok: true,
      reviewJson: {
        ...parsed.data,
        requirements: gradingRubric.requirements.flatMap((requirement) => {
          const item = byKey.get(requirement.key);
          return item
            ? [
                {
                  key: item.key,
                  name: requirement.name,
                  status: item.status,
                  comment: item.comment,
                },
              ]
            : [];
        }),
      },
    };
  }

  const parsed = parseModelJson(text, EstimatedReviewSchema, INVALID_REVIEW_JSON_MESSAGE);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, reviewJson: parsed.data };
}

export function isRateLimitError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

/** Transient errors worth a backoff retry; see GEMINI_RETRYABLE_STATUSES for the choice. */
export function isRetryableError(error: unknown): error is ApiError {
  return error instanceof ApiError && GEMINI_RETRYABLE_STATUSES.includes(error.status);
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

const RATE_LIMIT_MESSAGE =
  "Gemini APIの利用上限に達しました。しばらく時間を置いてから再試行してください。";
const OVERLOADED_MESSAGE = "AIが混み合っています。しばらく時間を置いてから再試行してください。";
const TIMEOUT_MESSAGE =
  "Gemini APIの応答がタイムアウトしました。しばらく時間を置いてから再試行してください。";
const UNKNOWN_ERROR_MESSAGE =
  "AIレビューの生成中にエラーが発生しました。しばらく時間を置いてから再試行してください。";

/**
 * The message stored in ai_reviews.error_message and shown to the learner as is, so no error's own
 * text goes there: an ApiError carries the raw English JSON body, and a network failure ("fetch
 * failed", ECONNRESET) is just as raw. The status code alone is enough for an operator, who gets
 * the full (redacted) text from the server log (logGeminiFailure()).
 */
export function toUserFacingErrorMessage(error: unknown): string {
  if (isRateLimitError(error)) {
    return RATE_LIMIT_MESSAGE;
  }
  if (isRetryableError(error)) {
    return OVERLOADED_MESSAGE;
  }
  if (isTimeoutError(error)) {
    return TIMEOUT_MESSAGE;
  }
  if (error instanceof ApiError) {
    return `AIレビューの生成中にエラーが発生しました（コード: ${error.status}）。`;
  }
  return UNKNOWN_ERROR_MESSAGE;
}

function logGeminiFailure(error: unknown, apiKey: string): void {
  if (isTimeoutError(error)) {
    return;
  }
  const label = error instanceof ApiError ? `status=${error.status}` : "(no status)";
  console.error(`Gemini APIエラー ${label}:`, toSafeError(error, apiKey).message);
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

function addUsage(
  total: TokenUsage,
  usageMetadata: GenerateContentResponseUsageMetadata | undefined
): TokenUsage {
  return {
    promptTokens: addTokenCount(total.promptTokens, usageMetadata?.promptTokenCount ?? null),
    completionTokens: addTokenCount(
      total.completionTokens,
      usageMetadata?.candidatesTokenCount ?? null
    ),
    thoughtsTokens: addTokenCount(total.thoughtsTokens, usageMetadata?.thoughtsTokenCount ?? null),
  };
}

interface StructuredRequest<T> {
  apiKey: string;
  systemInstruction: string;
  contents: string;
  responseSchema: Schema;
  parse: (text: string | undefined) => { ok: true; value: T } | { ok: false; reason: string };
  models: readonly GeminiModelConfig[];
}

function modelChainFor(modelName?: string): readonly GeminiModelConfig[] {
  if (!modelName) {
    return GEMINI_MODEL_CONFIGS;
  }
  const registered = GEMINI_MODEL_CONFIGS.find((model) => model.name === modelName);
  // A dry-run candidate may not be registered yet; it still needs a thinking level.
  return [registered ?? { name: modelName, thinkingLevel: GEMINI_THINKING_LEVEL }];
}

function hasTimeForAttempt(deadlineAt: number, delayMs = 0): boolean {
  return Date.now() + delayMs + GEMINI_RETRY_MIN_ATTEMPT_MS < deadlineAt;
}

function isModelMissingError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404;
}

/** Per-attempt timeout only. An overall-deadline abort is not a reason to start another model. */
function isPerAttemptTimeout(error: unknown, overallSignal: AbortSignal): boolean {
  return isTimeoutError(error) && !overallSignal.aborted;
}

function isSwitchableGeminiError(error: unknown, overallSignal: AbortSignal): boolean {
  return (
    isRetryableError(error) ||
    isModelMissingError(error) ||
    isPerAttemptTimeout(error, overallSignal)
  );
}

function switchLabel(error: unknown): string {
  if (error instanceof ApiError) {
    return `status=${error.status}`;
  }
  return "timeout";
}

interface ChainResponse {
  response: GenerateContentResponse;
  modelIndex: number;
}

interface ChainStop {
  response?: undefined;
  error: unknown;
}

/**
 * Calls Gemini for validated JSON. A response that fails validation is regenerated once, on the
 * model that produced it. Every generation, model switch, and backoff wait shares one
 * GEMINI_TOTAL_BUDGET_MS deadline so the route's maxDuration still holds. Tokens of every
 * response are summed, including a failed first one, because Gemini bills them.
 * Congestion (429/500/503), a per-attempt timeout, and 404 move to the next model without waiting.
 * A 404, a per-attempt timeout, or a 400 from a later model drops only that model. Models that
 * already failed with a retryable status are still backed off, so a removed alternate cannot
 * erase the primary's retries. 401, 403, and 504 stop the chain: the key or the prompt is at fault.
 */
async function generateValidatedJson<T>({
  apiKey,
  systemInstruction,
  contents,
  responseSchema,
  parse,
  models,
}: StructuredRequest<T>): Promise<{ value: T; usage: TokenUsage; modelUsed: string }> {
  if (!apiKey) {
    throw new Error("Gemini APIキーが設定されていません");
  }
  if (models.length === 0) {
    throw new Error("Geminiモデルが設定されていません");
  }

  const ai = new GoogleGenAI({ apiKey });
  let usage: TokenUsage = { promptTokens: null, completionTokens: null, thoughtsTokens: null };
  let lastReason = EMPTY_RESPONSE_MESSAGE;
  // Validation retries stay on the model that answered, so two graders are not mixed into one score.
  let startIndex = 0;

  // Cap attempts plus waits at GEMINI_TOTAL_BUDGET_MS even when a call hangs until its own timeout
  // instead of failing fast (maxDuration guard).
  const deadlineAt = Date.now() + GEMINI_TOTAL_BUDGET_MS;
  const overallSignal = AbortSignal.timeout(GEMINI_TOTAL_BUDGET_MS);

  const callModel = (model: GeminiModelConfig) =>
    ai.models.generateContent({
      model: model.name,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        temperature: GEMINI_TEMPERATURE,
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: {
          thinkingLevel: model.thinkingLevel,
        },
        abortSignal: AbortSignal.any([
          AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
          overallSignal,
        ]),
      },
    });

  const requestChain = async (chainStart: number): Promise<ChainResponse | ChainStop> => {
    const skipped = new Set<number>();
    const retryableIndexes = new Set<number>();
    // Shown to the learner when a later model is simply missing or rejects its own parameters.
    let lastRetryable: ApiError | undefined;
    let lastError: unknown;

    const hasRetryableLeft = () =>
      [...retryableIndexes].some((index) => index >= chainStart && !skipped.has(index));

    for (let round = 0; round <= GEMINI_MAX_RETRIES; round++) {
      if (round > 0) {
        const delay = GEMINI_RETRY_BASE_DELAY_MS * 2 ** (round - 1);
        // A retry with less than GEMINI_RETRY_MIN_ATTEMPT_MS left is aborted before Gemini
        // answers, and the prompt is still billed.
        if (!lastRetryable || !hasTimeForAttempt(deadlineAt, delay)) {
          return { error: lastRetryable ?? lastError };
        }
        console.warn(
          `Gemini API一時エラー status=${lastRetryable.status} (試行 ${round}/${GEMINI_MAX_RETRIES + 1})、${delay}ms後にリトライ`
        );
        await sleep(delay);
      }

      const planned: number[] = [];
      for (let index = chainStart; index < models.length; index++) {
        if (skipped.has(index)) {
          continue;
        }
        // Later rounds call only models that were congested. A 404 or a timeout stays out.
        if (round > 0 && !retryableIndexes.has(index)) {
          continue;
        }
        planned.push(index);
      }

      let attempted = 0;
      for (let position = 0; position < planned.length; position++) {
        if (overallSignal.aborted || (attempted > 0 && !hasTimeForAttempt(deadlineAt))) {
          break;
        }
        attempted++;
        const index = planned[position];
        const model = models[index];
        const next = planned[position + 1];
        try {
          const response = await callModel(model);
          return { response, modelIndex: index };
        } catch (error) {
          // A call cut off by the overall deadline says nothing new. Keep the status that caused
          // the retry so a 503 is not reported as a timeout. A per-attempt timeout is a slow answer.
          const cutByDeadline = isTimeoutError(error) && overallSignal.aborted;
          if (cutByDeadline) {
            return { error: lastRetryable ?? error };
          }

          const switchToNext =
            next !== undefined &&
            isSwitchableGeminiError(error, overallSignal) &&
            hasTimeForAttempt(deadlineAt);
          const warnSwitch = () => {
            if (next === undefined) {
              return;
            }
            // Congestion is usually per model, so skip it instead of waiting on the same id.
            console.warn(
              `Geminiモデルを切り替えます ${model.name} → ${models[next].name} (${switchLabel(error)})`
            );
          };

          if (isModelMissingError(error)) {
            // Retrying a removed id will not bring it back. The pinned constant has to change.
            console.error(
              `Geminiモデルが見つかりません model=${model.name} status=404。` +
                "app/constants/gemini.ts を更新してください"
            );
            skipped.add(index);
            lastError = error;
            if (switchToNext) {
              warnSwitch();
              continue;
            }
            break;
          }

          if (isPerAttemptTimeout(error, overallSignal)) {
            skipped.add(index);
            retryableIndexes.delete(index);
            lastError = error;
            if (!hasRetryableLeft()) {
              lastRetryable = undefined;
            }
            if (switchToNext) {
              warnSwitch();
              continue;
            }
            break;
          }

          if (isRetryableError(error)) {
            lastRetryable = error;
            retryableIndexes.add(index);
            lastError = error;
            if (switchToNext) {
              warnSwitch();
              continue;
            }
            break;
          }

          if (error instanceof ApiError && error.status === 400 && lastRetryable) {
            // The alternate rejected its own parameters. The congested model can still be retried.
            skipped.add(index);
            break;
          }

          return { error };
        }
      }

      // attempted === 0 keeps the previous error (the deadline closed before a new call).
      if (attempted === 0 || !hasRetryableLeft()) {
        return { error: lastRetryable ?? lastError };
      }
    }

    return { error: lastRetryable ?? lastError };
  };

  for (
    let validationAttempt = 0;
    validationAttempt < GEMINI_VALIDATION_ATTEMPTS;
    validationAttempt++
  ) {
    // Regeneration needs a full attempt window. Less than that is aborted, and still billed.
    if (validationAttempt > 0 && Date.now() + GEMINI_REQUEST_TIMEOUT_MS > deadlineAt) {
      break;
    }

    const outcome = await requestChain(startIndex);
    // Once the call itself failed, the first response's validation reason no longer explains it
    // (a 503 must still read as "busy"). usage keeps tokens from responses already received.
    if (!outcome.response) {
      logGeminiFailure(outcome.error, apiKey);
      throw new ReviewGenerationError(toUserFacingErrorMessage(outcome.error), usage);
    }

    usage = addUsage(usage, outcome.response.usageMetadata);

    const parsed = parse(outcome.response.text);
    if (parsed.ok) {
      return {
        value: parsed.value,
        usage,
        modelUsed: models[outcome.modelIndex].name,
      };
    }
    lastReason = parsed.reason;
    startIndex = outcome.modelIndex;
    console.warn(
      `Gemini応答の検証に失敗 (試行 ${validationAttempt + 1}/${GEMINI_VALIDATION_ATTEMPTS}): ${parsed.reason}`
    );
  }

  throw new ReviewGenerationError(lastReason, usage);
}

export function resolveScoreKind(
  submission: ReviewSubmission,
  gradingRubric: GradingRubric | null | undefined
): ScoreKind {
  if (submission.type === "url") {
    return "none";
  }
  return gradingRubric ? "rubric" : "estimated";
}

export async function generateReview({
  exerciseInstructions,
  submission,
  referenceAnswer,
  gradingRubric,
  starterFiles,
  apiKey,
  modelName,
}: GenerateReviewParams): Promise<ReviewResult> {
  const scoreKind = resolveScoreKind(submission, gradingRubric);
  const rubric = scoreKind === "rubric" ? (gradingRubric ?? null) : null;

  const {
    value: reviewJson,
    usage,
    modelUsed,
  } = await generateValidatedJson<ReviewJson>({
    apiKey,
    systemInstruction: SYSTEM_PROMPT,
    contents: buildUserPrompt(
      exerciseInstructions,
      submission,
      referenceAnswer,
      rubric,
      starterFiles
    ),
    responseSchema: buildReviewResponseSchema(scoreKind, rubric),
    parse: (text) => {
      const parsed = parseReviewResponse(text, scoreKind, rubric);
      return parsed.ok ? { ok: true, value: parsed.reviewJson } : parsed;
    },
    models: modelChainFor(modelName),
  });

  const overallScore = computeReviewScore(reviewJson);

  return {
    reviewJson,
    scoreKind,
    rubricVersion: rubric?.version ?? null,
    reviewContent: renderReviewMarkdown(reviewJson, overallScore, scoreKind),
    overallScore,
    passed: scoreKind === "rubric" ? isReviewPassed(reviewJson, overallScore) : null,
    modelUsed,
    ...usage,
  };
}

export const RUBRIC_DRAFT_SYSTEM_PROMPT = `Web技術講座の採点基準を作るアシスタントです。演習課題の内容と模範回答から、受講生の提出物が満たすべき要件（採点基準）を日本語で${GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS}〜${GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS}件作成し、指定されたJSON形式のみで返してください。

- name は短い要件名（100文字以内）
- description は達成/部分的/未達成を判定できる具体的な観点（500文字以内）
- 要件は互いに重複させず、課題文に書かれた内容を超える要求を足さない`;

export function buildRubricDraftPrompt(
  exerciseInstructions: string,
  referenceAnswer?: string | null
): string {
  const referenceSection = referenceAnswer ? `\n## 模範回答\n${referenceAnswer}\n` : "";
  return `## 課題内容\n${exerciseInstructions}\n${referenceSection}`;
}

const RUBRIC_DRAFT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    requirements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { name: REVIEW_TEXT_SCHEMA, description: REVIEW_TEXT_SCHEMA },
        required: ["name", "description"],
      },
      minItems: String(GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS),
      maxItems: String(GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS),
    },
  },
  required: ["requirements"],
};

export type GradingRubricDraft = { name: string; description: string }[];

/** Draft only: the caller expands it into the form; nothing is saved without an instructor. */
export async function generateGradingRubricDraft({
  exerciseInstructions,
  referenceAnswer,
  apiKey,
}: {
  exerciseInstructions: string;
  referenceAnswer?: string | null;
  apiKey: string;
}): Promise<GradingRubricDraft> {
  const { value } = await generateValidatedJson<GradingRubricDraft>({
    apiKey,
    systemInstruction: RUBRIC_DRAFT_SYSTEM_PROMPT,
    contents: buildRubricDraftPrompt(exerciseInstructions, referenceAnswer),
    responseSchema: RUBRIC_DRAFT_RESPONSE_SCHEMA,
    parse: (text) => {
      const parsed = parseModelJson(
        text,
        GradingRubricDraftSchema,
        "採点基準の下書きをJSONとして解釈できませんでした"
      );
      return parsed.ok
        ? { ok: true, value: parsed.data.requirements }
        : { ok: false, reason: parsed.reason };
    },
    models: modelChainFor(),
  });
  return value;
}

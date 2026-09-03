import type { ThinkingLevel } from "@google/genai";

/** Gemini モデル名。キーのティアが違っても同一モデルを使う */
export const GEMINI_MODEL_NAME = "gemini-3.6-flash";

/** 提出コードの入力上限（文字数）。プロンプト構築と API バリデーションで共有する */
export const GEMINI_MAX_CODE_LENGTH = 8000;

/**
 * レビュー生成の最大出力トークン数。
 * Gemini 3系では思考トークンもこの枠と出力課金を消費するため、本文用に余裕を持たせる。
 */
export const GEMINI_MAX_OUTPUT_TOKENS = 4000;

/**
 * Gemini 3系の思考レベル。思考を完全には無効化できないため最小レベルを指定する。
 * SDK の enum 値は `"LOW"` だが、REST では `"low"` の疎通が確認済みのためその値を送る。
 */
export const GEMINI_THINKING_LEVEL = "low" as ThinkingLevel;

/** 429 時のリトライ回数（初回を除く）。合計試行は GEMINI_MAX_RETRIES + 1 */
export const GEMINI_MAX_RETRIES = 2;

/** 429 リトライの初回待機（ms）。以降は 2^attempt で指数バックオフ */
export const GEMINI_RETRY_BASE_DELAY_MS = 5000;

/**
 * Gemini 呼び出し1回（1試行）あたりのタイムアウト（ms）。
 * 実際に1試行へ許される時間は、これと GEMINI_TOTAL_BUDGET_MS の残り時間の
 * 短い方（AbortSignal.any で合成）になる。
 */
export const GEMINI_REQUEST_TIMEOUT_MS = 25_000;

/**
 * generateReview() 全体（全試行+リトライ待機の合計）に許すタイムアウト（ms）。
 * 429が即座に返らず GEMINI_REQUEST_TIMEOUT_MS 近くまで待たされるケースでも、
 * 全試行の合計時間をここで頭打ちにすることで `/api/ai-review` の `maxDuration`
 * （route.ts に定数として直書き）内に収まることを保証する。
 * DB往復等のオーバーヘッド分の余裕を残すため、maxDuration より十分小さい値にすること。
 */
export const GEMINI_TOTAL_BUDGET_MS = 45_000;

/** 会員（status=active）向け API キーの環境変数名 */
export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

/** お試しユーザー（status=pending）向け API キーの環境変数名 */
export const GEMINI_API_KEY_TRIAL_ENV = "GEMINI_API_KEY_TRIAL";

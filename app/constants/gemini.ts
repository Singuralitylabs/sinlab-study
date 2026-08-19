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

/** 会員（status=active）向け API キーの環境変数名 */
export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

/** お試しユーザー（status=pending）向け API キーの環境変数名 */
export const GEMINI_API_KEY_TRIAL_ENV = "GEMINI_API_KEY_TRIAL";

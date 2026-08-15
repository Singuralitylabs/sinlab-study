/** Gemini モデル名。キーのティアが違っても同一モデルを使う */
export const GEMINI_MODEL_NAME = "gemini-2.5-flash";

/** 提出コードの入力上限（文字数）。プロンプト構築と API バリデーションで共有する */
export const GEMINI_MAX_CODE_LENGTH = 8000;

/** レビュー生成の最大出力トークン数 */
export const GEMINI_MAX_OUTPUT_TOKENS = 1500;

/**
 * thinking tokens の予算。0 で無効化し、出力トークン枠をレビュー本文に確保する。
 */
export const GEMINI_THINKING_BUDGET = 0;

/** 429 時のリトライ回数（初回を除く）。合計試行は GEMINI_MAX_RETRIES + 1 */
export const GEMINI_MAX_RETRIES = 2;

/** 429 リトライの初回待機（ms）。以降は 2^attempt で指数バックオフ */
export const GEMINI_RETRY_BASE_DELAY_MS = 5000;

/** 会員（status=active）向け API キーの環境変数名 */
export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

/** お試しユーザー（status=pending）向け API キーの環境変数名 */
export const GEMINI_API_KEY_TRIAL_ENV = "GEMINI_API_KEY_TRIAL";

import type { ThinkingLevel } from "@google/genai";

/**
 * Primary Gemini model for AI review. Pin a concrete stable id (never a `-latest` alias) so
 * scoring tendency does not change without a human merge (#369).
 */
export const GEMINI_MODEL_NAME = "gemini-3.8-flash";

/**
 * Alternate Flash model. Runtime fallback when the primary is congested, times out, or 404s (#368).
 * Kept as its own export because the model-check workflow rewrites this literal.
 */
export const GEMINI_ALTERNATE_MODEL_NAME = "gemini-3.6-flash";

/** Max code length (chars); shared by prompt building and API validation. */
export const GEMINI_MAX_CODE_LENGTH = 8000;

/**
 * Max total chars for learning_contents.starter_files. Kept well below GEMINI_MAX_CODE_LENGTH so
 * learners can still add code and the review prompt (starter + submission) stays within budget.
 */
export const STARTER_FILES_MAX_TOTAL_LENGTH = Math.floor(GEMINI_MAX_CODE_LENGTH / 2);

/**
 * Gemini 3 spends thinking tokens (and output billing) from this budget, so leave headroom for the
 * body.
 */
export const GEMINI_MAX_OUTPUT_TOKENS = 4000;

/**
 * Thinking can't be fully disabled on Gemini 3, so use the lowest level. The SDK enum value is
 * "LOW", but "low" is what was verified over REST, so send that.
 */
export const GEMINI_THINKING_LEVEL = "low" as ThinkingLevel;

export interface GeminiModelConfig {
  /** Concrete model id. Never a `-latest` alias. */
  name: string;
  thinkingLevel: ThinkingLevel;
}

/**
 * Call order for one review: primary, then alternate. Per-model settings live here so a fallback
 * can differ (thinking level) without a second request path. Names stay the exports above so the
 * model-check rewrite keeps this list in sync.
 */
export const GEMINI_MODEL_CONFIGS: readonly GeminiModelConfig[] = [
  { name: GEMINI_MODEL_NAME, thinkingLevel: GEMINI_THINKING_LEVEL },
  { name: GEMINI_ALTERNATE_MODEL_NAME, thinkingLevel: GEMINI_THINKING_LEVEL },
];

/** Models the auto-detect workflow treats as "registered" (primary first). */
export const GEMINI_REGISTERED_MODELS: readonly string[] = GEMINI_MODEL_CONFIGS.map(
  (model) => model.name
);

/** Deterministic judging: the same submission should get the same labels as far as possible. */
export const GEMINI_TEMPERATURE = 0;

/**
 * Gemini calls per review when the response fails validation (the first try plus one regeneration).
 * Each attempt is billed, so this caps the cost of a malformed response.
 */
export const GEMINI_VALIDATION_ATTEMPTS = 2;

/**
 * Backoff rounds after every model in the chain has failed with a retryable status (excluding
 * the first pass). Total passes = GEMINI_MAX_RETRIES + 1. Switching models is not one of these
 * rounds (#368).
 */
export const GEMINI_MAX_RETRIES = 2;

/**
 * HTTP statuses retried with backoff: 429 (rate limit), 503 (model overloaded) and 500 (Google
 * documents INTERNAL as transient and retryable). 504 is left out: Google returns it when the
 * request itself is too large to finish in time, so resending the same prompt only burns the
 * budget. 4xx other than 429 are permanent (bad request, key, permission) and never retried.
 * 404 is not in this list: a missing model is switched once and logged, not waited out (#368).
 */
export const GEMINI_RETRYABLE_STATUSES: readonly number[] = [429, 500, 503];

/** Initial retry wait (ms); exponential backoff (2^attempt) after that. */
export const GEMINI_RETRY_BASE_DELAY_MS = 5000;

/**
 * Least time a retry must have left before GEMINI_TOTAL_BUDGET_MS (ms). A retry started closer
 * to the deadline is aborted before Gemini can answer, yet its prompt is still billed.
 */
export const GEMINI_RETRY_MIN_ATTEMPT_MS = 5000;

/**
 * Timeout per attempt (ms). The time an attempt actually gets is the shorter of this and the
 * remaining GEMINI_TOTAL_BUDGET_MS (combined via AbortSignal.any).
 */
export const GEMINI_REQUEST_TIMEOUT_MS = 25_000;

/**
 * Cap for all of generateReview() (attempts + retry waits). Even when retried errors take close to
 * GEMINI_REQUEST_TIMEOUT_MS to return, this keeps the total within /api/ai-review's maxDuration
 * (hardcoded in route.ts). Keep it well below maxDuration to leave room for DB round trips.
 */
export const GEMINI_TOTAL_BUDGET_MS = 45_000;

/**
 * A pending / processing review older than this is treated as dead (its function was killed) and
 * stops counting toward the limits, so a crashed run can neither burn an allowance nor lock the
 * submission. Must exceed /api/ai-review's maxDuration (60s, hardcoded in route.ts).
 */
export const AI_REVIEW_STALE_AFTER_MS = 90_000;

export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

export const GEMINI_API_KEY_TRIAL_ENV = "GEMINI_API_KEY_TRIAL";

/**
 * AI review count limits (#304). API, UI copy and docs all derive from here. The day boundary is
 * JST (same basis as the email cron). Every review row except `failed` counts: a Gemini-side
 * failure must not consume a learner's allowance.
 */
export const AI_REVIEW_LIMITS = {
  active: {
    /** Reviews per content per JST day, for new submissions only (one review per submission). */
    perContentPerDay: 2,
    /** Reviews per user per JST day across all contents; caps key abuse and cost spikes. */
    perDay: 10,
  },
  trial: {
    /** Lifetime reviews per content; the daily total does not apply to trial users. */
    perContentLifetime: 1,
  },
} as const;

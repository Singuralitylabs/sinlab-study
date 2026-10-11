import type { ThinkingLevel } from "@google/genai";

/** Same model regardless of key tier. */
export const GEMINI_MODEL_NAME = "gemini-3.6-flash";

/** Max code length (chars); shared by prompt building and API validation. */
export const GEMINI_MAX_CODE_LENGTH = 8000;

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

/** Retries on 429 (excluding the first attempt); total attempts = GEMINI_MAX_RETRIES + 1. */
export const GEMINI_MAX_RETRIES = 2;

/** Initial 429 retry wait (ms); exponential backoff (2^attempt) after that. */
export const GEMINI_RETRY_BASE_DELAY_MS = 5000;

/**
 * Timeout per attempt (ms). The time an attempt actually gets is the shorter of this and the
 * remaining GEMINI_TOTAL_BUDGET_MS (combined via AbortSignal.any).
 */
export const GEMINI_REQUEST_TIMEOUT_MS = 25_000;

/**
 * Cap for all of generateReview() (attempts + retry waits). Even when 429s take close to
 * GEMINI_REQUEST_TIMEOUT_MS to return, this keeps the total within /api/ai-review's maxDuration
 * (hardcoded in route.ts). Keep it well below maxDuration to leave room for DB round trips.
 */
export const GEMINI_TOTAL_BUDGET_MS = 45_000;

export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

export const GEMINI_API_KEY_TRIAL_ENV = "GEMINI_API_KEY_TRIAL";

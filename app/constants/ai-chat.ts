import type { ThinkingLevel } from "@google/genai";
import type { ContentType } from "@/app/types";

/** Master switch for the シンラビ chat (#569). Fail-closed: only "true" enables. */
export function isAiChatEnabled(): boolean {
  return process.env.AI_CHAT_ENABLED === "true";
}

export const AI_CHAT_DISABLED_MESSAGE = "シンラビに相談は現在利用できません";

/**
 * Stage 1 covers articles and exercises only. Video / slide context lives outside the DB, and a
 * quiz must not get an AI that solves it (its answers stay in quiz_questions).
 */
export const AI_CHAT_CONTENT_TYPES: readonly ContentType[] = ["text", "exercise"];

/** One learner question (trimmed). Shared by the API schema and the input box. */
export const AI_CHAT_MESSAGE_MAX_LENGTH = 500;

/**
 * Longest answer kept anywhere: the API cuts a longer reply, and history entries / saved notes are
 * validated against it (the DB CHECK on ai_chat_saved_notes.answer mirrors it).
 */
export const AI_CHAT_ANSWER_MAX_LENGTH = 2000;

/** Past turns sent with a question; each turn is one question and one answer. */
export const AI_CHAT_HISTORY_MAX_TURNS = 3;
export const AI_CHAT_HISTORY_MAX_MESSAGES = AI_CHAT_HISTORY_MAX_TURNS * 2;

/** Article body cap (chars) in the prompt. Bodies run to ~20k chars; the tail is dropped. */
export const AI_CHAT_ARTICLE_MAX_CHARS = 20_000;

/** Exercise instructions + hint + starter cap (chars), so a huge exercise cannot outgrow an article. */
export const AI_CHAT_EXERCISE_MAX_CHARS = 8000;

/** Learner's latest submission cap (chars, all files together). */
export const AI_CHAT_SUBMISSION_MAX_CHARS = 6000;

/** Requirement comments from the latest review are cut to this many chars each. */
export const AI_CHAT_REVIEW_COMMENT_MAX_CHARS = 200;

/**
 * Includes thinking tokens on Gemini 3, so it leaves room above the ~800-char answer target. A
 * reply that still hits it gets AI_CHAT_CUT_NOTE appended.
 */
export const AI_CHAT_MAX_OUTPUT_TOKENS = 2500;

/** Appended to a reply that was cut (output cap or AI_CHAT_ANSWER_MAX_LENGTH). */
export const AI_CHAT_CUT_NOTE = "\n\n…（長いので、ここで切ったよ）";

export const AI_CHAT_THINKING_LEVEL = "low" as ThinkingLevel;

/** Some variety reads more natural for a chat; review grading keeps 0. */
export const AI_CHAT_TEMPERATURE = 0.7;

/** Per-attempt timeout (ms); the shorter of this and the remaining total budget applies. */
export const AI_CHAT_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Cap for all Gemini attempts of one question (ms). Keep it well below /api/ai-chat's maxDuration
 * (40s, a literal in route.ts) to leave room for DB round trips.
 */
export const AI_CHAT_TOTAL_BUDGET_MS = 25_000;

/**
 * A pending usage row older than this is treated as dead (its function was killed) and stops
 * counting. Must exceed /api/ai-chat's maxDuration (40s).
 */
export const AI_CHAT_STALE_AFTER_MS = 60_000;

/** Saved answers per user; beyond this POST /api/ai-chat/saved-notes returns 409. */
export const AI_CHAT_SAVED_NOTES_MAX_PER_USER = 300;

/**
 * Initial chat limits (#569). The source of truth is the ai_chat_settings row; these are its
 * defaults and the fallback when it can't be read or holds out-of-range values.
 */
export const AI_CHAT_LIMITS = {
  /** Questions per active user per JST day, across all contents. */
  activePerDay: 20,
  /** Questions per trial user, ever. */
  trialLifetime: 5,
} as const;

export interface AIChatLimits {
  activePerDay: number;
  trialLifetime: number;
}

/**
 * Range an admin can set. The upper ends cap the Gemini cost of a wrong entry; the DB CHECK
 * constraints mirror them.
 */
export const AI_CHAT_LIMIT_BOUNDS = {
  activePerDay: { min: 1, max: 100 },
  trialLifetime: { min: 1, max: 30 },
} as const;

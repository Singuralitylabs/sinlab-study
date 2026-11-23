import { AI_CHAT_HISTORY_MAX_MESSAGES, type AiChatKind } from "@/app/constants/ai-chat";
import type { ChatUsageSummary } from "./ai-chat-limits";

export interface ChatTurn {
  id: number;
  question: string;
  /** null while the answer is on its way; failed questions are dropped instead of kept. */
  answer: string | null;
}

/**
 * The history sent with the next question: answered turns only, newest last, within the API's
 * cap. An unanswered turn is never sent, so the server never sees a question without its reply.
 */
export function buildChatHistory(
  turns: readonly ChatTurn[]
): { role: "user" | "assistant"; content: string }[] {
  const answered = turns.filter((turn): turn is ChatTurn & { answer: string } => !!turn.answer);
  return answered
    .flatMap((turn) => [
      { role: "user" as const, content: turn.question },
      { role: "assistant" as const, content: turn.answer },
    ])
    .slice(-AI_CHAT_HISTORY_MAX_MESSAGES);
}

export function formatChatRemaining(usage: ChatUsageSummary): string {
  return usage.period === "daily"
    ? `今日はあと ${usage.remaining} 回`
    : `お試しであと ${usage.remaining} 回`;
}

/** Starter questions shown before the first message; tapping one fills the input. */
/** A slide with an article (#589) arrives as "text", so it gets the article suggestions. */
export function chatSuggestions(contentType: AiChatKind): string[] {
  return contentType === "text"
    ? [
        "この記事の要点を3行で教えて",
        "〇〇がよく分からないので、やさしく説明して",
        "この記事の例をもう1つ見せて",
      ]
    : ["この課題は何から始めればいい？", "エラーの読み方を教えて", "提出のどこが足りないか教えて"];
}

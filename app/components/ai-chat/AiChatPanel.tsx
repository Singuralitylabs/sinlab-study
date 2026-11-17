"use client";

import { Bookmark, BookmarkCheck, RotateCcw, Send, X } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { UpgradeCtaLink } from "@/app/components/UpgradeCtaLink";
import { AI_CHAT_MESSAGE_MAX_LENGTH } from "@/app/constants/ai-chat";
import { UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { HINT_MASCOT } from "@/app/constants/mascot";
import { UPGRADE_APPROVAL_NOTICE } from "@/app/constants/stripe";
import {
  buildChatHistory,
  type ChatTurn,
  chatSuggestions,
  formatChatRemaining,
} from "@/app/lib/ai-chat-client";
import type { ChatUsageSummary } from "@/app/lib/ai-chat-limits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type SaveState = "idle" | "saving" | "saved" | "error";

interface AiChatPanelProps {
  contentId: number;
  contentType: "text" | "exercise";
  stripeEnabled: boolean;
  /** Only members have /review-list, so admin / maintainer get no save button (nowhere to read it). */
  canSave: boolean;
}

const DISCLAIMER =
  "シンラビは AI です。間違えることがあるので、大事なところは記事や公式ドキュメントで確かめてね";

function Mascot({ thinking, size }: { thinking: boolean; size: "sm" | "md" }) {
  const image = thinking ? HINT_MASCOT.closed : HINT_MASCOT.open;
  return (
    <Image
      src={image.src}
      alt=""
      width={image.width}
      height={image.height}
      sizes="48px"
      className={size === "sm" ? "h-10 w-8 shrink-0 object-contain" : "h-12 w-10 object-contain"}
    />
  );
}

/**
 * The conversation lives only in this component's state (#569): it is gone after a reload or a
 * move to another content (the page remounts it per content). Nothing is fetched until the panel
 * is first opened.
 */
export function AiChatPanel({ contentId, contentType, stripeEnabled, canSave }: AiChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ChatUsageSummary | null>(null);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-chat/usage");
      if (res.ok) {
        const body = (await res.json()) as { usage: ChatUsageSummary };
        setUsage(body.usage);
      }
    } catch {
      // The count is a hint only; the send itself is limited on the server.
    }
  }, []);

  useEffect(() => {
    if (open && usage === null) {
      void loadUsage();
    }
  }, [open, usage, loadUsage]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Scroll to the newest bubble when a question or answer is added (turns.length changes on send,
  // the answer swaps the last turn's content).
  const lastAnswer = turns.at(-1)?.answer ?? null;
  useEffect(() => {
    if (turns.length === 0 && lastAnswer === null) {
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, lastAnswer]);

  const exhausted = usage !== null && usage.remaining <= 0;
  const trimmed = input.trim();
  const canSend =
    !sending && !exhausted && trimmed.length > 0 && trimmed.length <= AI_CHAT_MESSAGE_MAX_LENGTH;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) {
      return;
    }
    const question = trimmed;
    const history = buildChatHistory(turns);
    const id = nextId.current++;
    setTurns((prev) => [...prev, { id, question, answer: null }]);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, message: question, history }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        answer?: string;
        remaining?: number;
        limit?: number;
        error?: string;
      };
      if (res.ok && body.answer) {
        const answer = body.answer;
        setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
        if (typeof body.remaining === "number") {
          const remaining = body.remaining;
          setUsage((prev) => (prev ? { ...prev, remaining } : prev));
        }
        return;
      }
      // A failed question is dropped (it was not counted) and put back in the box to resend.
      setTurns((prev) => prev.filter((turn) => turn.id !== id));
      setInput(question);
      if (res.status === 429) {
        setUsage((prev) => (prev ? { ...prev, remaining: 0 } : prev));
        void loadUsage();
      }
      setError(body.error ?? "送信に失敗しました。少し待ってからもう一度送ってね");
    } catch {
      setTurns((prev) => prev.filter((turn) => turn.id !== id));
      setInput(question);
      setError("通信に失敗しました。接続を確かめて、もう一度送ってね");
    } finally {
      setSending(false);
    }
  }

  async function save(turn: ChatTurn) {
    if (!turn.answer) {
      return;
    }
    setSaveStates((prev) => ({ ...prev, [turn.id]: "saving" }));
    try {
      const res = await fetch("/api/ai-chat/saved-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, question: turn.question, answer: turn.answer }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "復習リストに残せませんでした");
        setSaveStates((prev) => ({ ...prev, [turn.id]: "error" }));
        return;
      }
      setSaveStates((prev) => ({ ...prev, [turn.id]: "saved" }));
    } catch {
      setError("復習リストに残せませんでした");
      setSaveStates((prev) => ({ ...prev, [turn.id]: "error" }));
    }
  }

  function reset() {
    setTurns([]);
    setSaveStates({});
    setError(null);
    setInput("");
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pr-4 pl-2 text-sm font-medium shadow-lg transition-colors hover:bg-muted"
        >
          <Mascot thinking={false} size="sm" />
          シンラビに相談
        </button>
      )}

      {open && (
        <section
          aria-label="シンラビに相談"
          className="fixed inset-x-0 bottom-0 z-40 flex h-[80dvh] flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[400px] md:rounded-none md:border-t-0 md:border-l"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Mascot thinking={false} size="md" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">シンラビに相談</h2>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {usage ? formatChatRemaining(usage) : " "}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={reset}
              disabled={sending || turns.length === 0}
              aria-label="会話をリセット"
              title="会話をリセット"
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              <X className="size-4" />
            </Button>
          </header>

          <p className="border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
            {canSave
              ? "画面を移ると会話は消えます。残したい回答は「復習リストに残す」で保存してね"
              : "画面を移ると会話は消えます"}
          </p>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Mascot thinking={false} size="sm" />
                  <div className="rounded-2xl border border-border bg-muted px-3 py-2 text-sm">
                    {contentType === "text"
                      ? "この記事のことなら何でも聞いてね！"
                      : "課題で困ったら聞いてね！答えそのものは教えられないけど、考え方は一緒に整理するよ"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {chatSuggestions(contentType).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn) => {
              const saveState = saveStates[turn.id] ?? "idle";
              return (
                <div key={turn.id} className="space-y-3">
                  <div className="ml-8 rounded-2xl bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                    {turn.question}
                  </div>
                  <div className="flex items-start gap-2">
                    <Mascot thinking={turn.answer === null} size="sm" />
                    <div className="min-w-0 flex-1">
                      {turn.answer === null ? (
                        <div className="rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                          考え中…
                        </div>
                      ) : (
                        <>
                          <div className="rounded-2xl border border-border bg-muted px-3 py-2 text-sm [&_pre]:text-xs">
                            <MarkdownRenderer content={turn.answer} />
                          </div>
                          {canSave && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-7 px-2 text-xs"
                              disabled={saveState === "saving" || saveState === "saved"}
                              onClick={() => void save(turn)}
                            >
                              {saveState === "saved" ? (
                                <BookmarkCheck className="size-3.5" />
                              ) : (
                                <Bookmark className="size-3.5" />
                              )}
                              {saveState === "saved"
                                ? "保存しました"
                                : saveState === "saving"
                                  ? "保存中…"
                                  : "復習リストに残す"}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 border-t border-border px-4 py-3">
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            {exhausted && usage?.period === "daily" && (
              <p className="text-xs text-muted-foreground">
                今日の相談回数を使い切ったよ。明日また使えるよ
              </p>
            )}
            {exhausted && usage?.period === "lifetime" && (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>お試しプランの相談回数を使い切ったよ。本登録すると毎日相談できるよ</p>
                {stripeEnabled ? (
                  <UpgradeCtaLink source={UPGRADE_CTA_SOURCE.AI_CHAT_LIMIT} size="sm">
                    アップグレード
                  </UpgradeCtaLink>
                ) : (
                  <p>{UPGRADE_APPROVAL_NOTICE}</p>
                )}
              </div>
            )}
            <form onSubmit={(event) => void send(event)} className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // Enter during IME conversion confirms the kana, so only a plain Ctrl/Cmd+Enter sends.
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey) &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
                maxLength={AI_CHAT_MESSAGE_MAX_LENGTH}
                rows={2}
                disabled={exhausted}
                placeholder={exhausted ? "今は送れません" : "シンラビに質問する"}
                aria-label="シンラビへの質問"
                className="max-h-32 min-h-0 resize-none text-sm"
              />
              <Button type="submit" size="icon" disabled={!canSend} aria-label="送信">
                <Send className="size-4" />
              </Button>
            </form>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {input.length > 0 && `${input.length} / ${AI_CHAT_MESSAGE_MAX_LENGTH} 文字・`}
              {DISCLAIMER}
            </p>
          </div>
        </section>
      )}
    </>
  );
}

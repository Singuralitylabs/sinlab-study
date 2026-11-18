"use client";

import { RotateCcw } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { PlaygroundFileInput } from "@/app/lib/playground";
import {
  createTerminalState,
  displayTerminalPath,
  runTerminalLine,
  TERMINAL_USER,
  type TerminalState,
} from "@/app/lib/playground-terminal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Entry = { id: number; kind: "command" | "stdout" | "stderr"; text: string };

/** Old lines are dropped past this, so a long session cannot grow the page without bound. */
const MAX_ENTRIES = 500;
const MAX_HISTORY = 100;

const WELCOME = "練習用のターミナルです。help で使えるコマンドを表示します。";

let nextEntryId = 0;
const entry = (kind: Entry["kind"], text: string): Entry => ({ id: ++nextEntryId, kind, text });

export function PlaygroundTerminal({
  files,
  heightClassName,
}: {
  files: readonly PlaygroundFileInput[];
  heightClassName?: string;
}) {
  // Built once from the editor's files; later edits there apply on 「やり直す」, so a typo fix in a
  // file does not wipe what the learner did in the terminal.
  const [state, setState] = useState<TerminalState>(() => createTerminalState(files));
  const [entries, setEntries] = useState<Entry[]>(() => [entry("stdout", WELCOME)]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const prompt = `${TERMINAL_USER}:${displayTerminalPath(state.cwd)}$`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever a line is added
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries]);

  const submit = () => {
    const line = input;
    setInput("");
    setHistoryIndex(null);
    if (line.trim()) {
      setHistory((previous) => [...previous, line].slice(-MAX_HISTORY));
    }
    const result = runTerminalLine(state, line);
    setState(result.state);
    const added = [
      entry("command", `${prompt} ${line}`),
      ...(result.stdout ? [entry("stdout", result.stdout.replace(/\n$/, ""))] : []),
      ...(result.stderr ? [entry("stderr", result.stderr.replace(/\n$/, ""))] : []),
    ];
    setEntries((previous) => (result.clear ? [] : [...previous, ...added].slice(-MAX_ENTRIES)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "ArrowUp" && history.length > 0) {
      event.preventDefault();
      const index = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(index);
      setInput(history[index]);
    } else if (event.key === "ArrowDown" && historyIndex !== null) {
      event.preventDefault();
      const index = historyIndex + 1;
      setHistoryIndex(index < history.length ? index : null);
      setInput(index < history.length ? history[index] : "");
    } else if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      setEntries([]);
    }
  };

  const restart = () => {
    setState(createTerminalState(files));
    setEntries([entry("stdout", WELCOME)]);
    setInput("");
    setHistoryIndex(null);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a click anywhere focuses the input, which handles keys */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: same as above */}
      <div
        className={cn(
          "overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-sm text-zinc-100",
          heightClassName ?? "h-[360px]"
        )}
        onClick={() => {
          // Focusing after a drag-select would clear it, and the learner could not copy output.
          if (!window.getSelection()?.toString()) {
            inputRef.current?.focus();
          }
        }}
      >
        <div role="log" aria-live="polite" aria-label="ターミナルの出力">
          {entries.map((item) => (
            <pre
              key={item.id}
              className={cn(
                "whitespace-pre-wrap break-all",
                item.kind === "stderr" && "text-red-300",
                item.kind === "command" && "text-zinc-300"
              )}
            >
              {item.text}
            </pre>
          ))}
        </div>
        <div ref={bottomRef} className="flex items-center gap-2">
          <label htmlFor="playground-terminal-input" className="shrink-0 text-green-400">
            {prompt}
          </label>
          <input
            id="playground-terminal-input"
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none"
            aria-describedby="playground-terminal-hint"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="playground-terminal-hint" className="text-xs text-muted-foreground">
          Enter で実行、↑↓ で前のコマンドを呼び出せます。
        </p>
        <Button type="button" size="sm" variant="outline" onClick={restart}>
          <RotateCcw className="h-4 w-4" />
          やり直す
        </Button>
      </div>
    </div>
  );
}

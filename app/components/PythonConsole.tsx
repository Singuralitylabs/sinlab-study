"use client";

import { Eye, EyeOff, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptPythonWorkerMessage,
  appendPythonOutput,
  PYTHON_LOAD_TIMEOUT_MS,
  PYTHON_MAX_FIGURES,
  PYTHON_MAX_OUTPUT_LENGTH,
  PYTHON_RUN_TIMEOUT_MS,
  PYTHON_WORKER_URL,
  type PythonOutputChunk,
  type PythonRunFile,
  preparePythonRun,
} from "@/app/lib/python-runner";
import type { CodeFile } from "@/app/types";
import { Button } from "@/components/ui/button";

interface PythonConsoleProps {
  files: CodeFile[];
  /** History lists mount many consoles, so they start collapsed (nothing is loaded until 実行). */
  collapsible?: boolean;
}

type RunState = "idle" | "loading" | "running" | "done";

interface RunOutput {
  chunks: PythonOutputChunk[];
  truncated: boolean;
  /** Object URLs of the PNGs matplotlib drew, in order. */
  figures: string[];
  figuresSkipped: boolean;
  /** Packages being loaded before the program starts (pandas etc.), for the loading message. */
  packages: string[];
  notice: string | null;
}

interface SpareWorker {
  worker: Worker;
  /** The module failed to load before anyone listened; this worker would never answer. */
  failed: boolean;
}

const EMPTY_OUTPUT: RunOutput = {
  chunks: [],
  truncated: false,
  figures: [],
  figuresSkipped: false,
  packages: [],
  notice: null,
};

function startWorker(): SpareWorker | null {
  try {
    const spare: SpareWorker = {
      worker: new Worker(PYTHON_WORKER_URL, { type: "module" }),
      failed: false,
    };
    spare.worker.onerror = () => {
      spare.failed = true;
    };
    return spare;
  } catch {
    return null;
  }
}

export function PythonConsole({ files, collapsible = false }: PythonConsoleProps) {
  const [open, setOpen] = useState(!collapsible);
  const [state, setState] = useState<RunState>("idle");
  const [output, setOutput] = useState<RunOutput | null>(null);
  // The worker running now, and one started ahead for the next run. A worker runs one program only,
  // so a run can never see what the previous one defined or imported.
  const workerRef = useRef<Worker | null>(null);
  const spareRef = useRef<SpareWorker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Output arrives one write at a time; it is gathered here and drawn once per frame, so a print loop
  // does not re-render the page thousands of times.
  const pendingRef = useRef<RunOutput>(EMPTY_OUTPUT);
  const frameRef = useRef<number | null>(null);
  // Figure URLs hold the PNG in memory until revoked: on the next run, on 閉じる and on unmount.
  const figureUrlsRef = useRef<string[]>([]);

  const revokeFigures = useCallback(() => {
    for (const url of figureUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    figureUrlsRef.current = [];
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setOutput(pendingRef.current);
  }, []);

  const scheduleFlush = useCallback(() => {
    frameRef.current ??= requestAnimationFrame(() => {
      frameRef.current = null;
      setOutput(pendingRef.current);
    });
  }, []);

  // Terminating is the only way to stop a program that never returns.
  const stopRun = useCallback(() => {
    clearTimer();
    workerRef.current?.terminate();
    workerRef.current = null;
  }, [clearTimer]);

  const stopAll = useCallback(() => {
    stopRun();
    spareRef.current?.worker.terminate();
    spareRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    revokeFigures();
  }, [stopRun, revokeFigures]);

  useEffect(() => stopAll, [stopAll]);

  // The next worker starts loading Pyodide, and the packages the files just run import, while the
  // learner reads the result.
  const prepareNext = useCallback((runFiles: PythonRunFile[]) => {
    if (!spareRef.current) {
      spareRef.current = startWorker();
      spareRef.current?.worker.postMessage({ type: "prepare", files: runFiles });
    }
  }, []);

  const run = () => {
    const plan = preparePythonRun(files);
    stopRun();
    revokeFigures();
    pendingRef.current = EMPTY_OUTPUT;
    if (!plan.ok) {
      pendingRef.current = { ...EMPTY_OUTPUT, notice: plan.message };
      flush();
      setState("done");
      return;
    }
    let spare = spareRef.current;
    spareRef.current = null;
    if (spare?.failed) {
      spare.worker.terminate();
      spare = null;
    }
    spare ??= startWorker();
    if (!spare) {
      pendingRef.current = { ...EMPTY_OUTPUT, notice: "Python の実行環境を開始できませんでした" };
      flush();
      setState("done");
      return;
    }
    const worker = spare.worker;
    workerRef.current = worker;
    flush();
    setState("loading");

    const finish = (notice: string | null, startSpare: boolean) => {
      if (workerRef.current !== worker) {
        return;
      }
      stopRun();
      if (notice) {
        pendingRef.current = { ...pendingRef.current, notice };
      }
      flush();
      setState("done");
      if (startSpare) {
        prepareNext(plan.files);
      }
    };
    timerRef.current = setTimeout(
      () =>
        finish(
          "実行環境の読み込みに時間がかかっています。再読み込みしてもう一度試してください",
          false
        ),
      PYTHON_LOAD_TIMEOUT_MS
    );
    worker.onmessage = (event: MessageEvent) => {
      const message = acceptPythonWorkerMessage(event.data);
      if (!message || workerRef.current !== worker) {
        return;
      }
      switch (message.type) {
        case "ready":
          setState("running");
          clearTimer();
          timerRef.current = setTimeout(
            () =>
              finish(
                `実行に時間がかかりすぎたので止めました（${PYTHON_RUN_TIMEOUT_MS / 1000} 秒）。終わらない繰り返しがないか確認してください`,
                true
              ),
            PYTHON_RUN_TIMEOUT_MS
          );
          break;
        case "output": {
          const next = appendPythonOutput(pendingRef.current.chunks, message.stream, message.text);
          pendingRef.current = {
            ...pendingRef.current,
            chunks: next.chunks,
            truncated: pendingRef.current.truncated || next.truncated,
          };
          scheduleFlush();
          break;
        }
        case "packages":
          pendingRef.current = { ...pendingRef.current, packages: message.names };
          scheduleFlush();
          break;
        case "figure": {
          const url = URL.createObjectURL(new Blob([message.png], { type: "image/png" }));
          figureUrlsRef.current.push(url);
          pendingRef.current = {
            ...pendingRef.current,
            figures: [...pendingRef.current.figures, url],
          };
          scheduleFlush();
          break;
        }
        case "figure-skipped":
          pendingRef.current = { ...pendingRef.current, figuresSkipped: true };
          scheduleFlush();
          break;
        case "truncated":
          pendingRef.current = { ...pendingRef.current, truncated: true };
          scheduleFlush();
          break;
        case "done":
          finish(null, true);
          break;
        default:
          // The worker writes these for the learner (load failures, an unexpected error).
          finish(message.message, false);
      }
    };
    worker.onerror = () => {
      finish(
        "Python の実行環境を読み込めませんでした。通信を確認して、もう一度試してください",
        false
      );
    };
    worker.postMessage({ type: "run", entry: plan.entry, files: plan.files });
  };

  const busy = state === "loading" || state === "running";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Pythonの実行</span>
        <div className="flex flex-wrap justify-end gap-2">
          {open && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={run}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              実行
            </Button>
          )}
          {collapsible && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (open) {
                  stopAll();
                  setState("idle");
                  setOutput(null);
                }
                setOpen((o) => !o);
              }}
            >
              {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {open ? "閉じる" : "Pythonの実行を表示"}
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="rounded-md border bg-muted/30">
          <div className="border-b px-3 py-1 text-xs font-medium text-muted-foreground">
            実行結果（Python）
          </div>
          {output === null ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              「実行」を押すと、コードを上から実行して、print
              の出力やエラーをここに表示します。matplotlib
              のグラフは、出力の下に画像で出ます。毎回、新しい状態から始まります。input()
              は使えません。
            </p>
          ) : (
            <PythonOutput output={output} state={state} />
          )}
        </div>
      )}
    </div>
  );
}

function PythonOutput({ output, state }: { output: RunOutput; state: RunState }) {
  return (
    <>
      <div className="max-h-96 space-y-2 overflow-y-auto px-3 py-2">
        {state === "loading" && (
          <p className="text-xs text-muted-foreground">
            {output.packages.length > 0
              ? `${output.packages.join("・")} を読み込んでいます（初回は十数秒かかることがあります）…`
              : "Python の実行環境を準備しています（初回は数秒〜十数秒かかります）…"}
          </p>
        )}
        {output.chunks.length > 0 && (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">
            {output.chunks.map((chunk, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: chunks are append-only.
                key={index}
                className={chunk.stream === "stderr" ? "text-destructive" : undefined}
              >
                {chunk.text}
              </span>
            ))}
          </pre>
        )}
        {state === "done" &&
          output.chunks.length === 0 &&
          output.figures.length === 0 &&
          !output.notice && <p className="text-xs text-muted-foreground">（出力はありません）</p>}
        {output.truncated && (
          <p className="text-xs text-muted-foreground">
            出力が多いため、先頭の {PYTHON_MAX_OUTPUT_LENGTH.toLocaleString()} 文字だけ表示しました
          </p>
        )}
        {output.notice && <p className="text-xs text-destructive">{output.notice}</p>}
      </div>
      {(output.figures.length > 0 || output.figuresSkipped) && (
        <div className="space-y-2 border-t px-3 py-2">
          {output.figures.map((url, index) => (
            // biome-ignore lint/performance/noImgElement: a blob: URL made in the browser; next/image cannot optimize it.
            <img
              key={url}
              src={url}
              alt={`グラフ ${index + 1}`}
              className="h-auto max-w-full rounded border bg-white"
            />
          ))}
          {output.figuresSkipped && (
            <p className="text-xs text-muted-foreground">
              グラフが多いか大きすぎるため、先頭の {PYTHON_MAX_FIGURES} 枚までだけ表示しました
            </p>
          )}
        </div>
      )}
    </>
  );
}

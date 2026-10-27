"use client";

import { Eye, EyeOff, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptSqlWorkerMessage,
  buildSqlScript,
  formatSqlCell,
  formatSqlCommand,
  SQL_LOAD_TIMEOUT_MS,
  SQL_MAX_ROWS,
  SQL_MAX_STATEMENTS,
  SQL_RUN_TIMEOUT_MS,
  SQL_WORKER_URL,
  type SqlStatementResult,
  splitSqlStatements,
} from "@/app/lib/sql-runner";
import type { CodeFile } from "@/app/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SqlConsoleProps {
  files: CodeFile[];
  /** History lists mount many consoles, so they start collapsed (nothing is loaded until 実行). */
  collapsible?: boolean;
}

type RunState = "idle" | "loading" | "running" | "done";

interface RunOutput {
  statements: string[];
  results: SqlStatementResult[];
  notice: string | null;
}

export function SqlConsole({ files, collapsible = false }: SqlConsoleProps) {
  const [open, setOpen] = useState(!collapsible);
  const [state, setState] = useState<RunState>("idle");
  const [output, setOutput] = useState<RunOutput | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Terminating the worker is the only way to stop a query that never returns; the next run starts a
  // fresh worker (and reloads PGlite).
  const stopWorker = useCallback(() => {
    clearTimer();
    workerRef.current?.terminate();
    workerRef.current = null;
  }, [clearTimer]);

  useEffect(() => stopWorker, [stopWorker]);

  const run = () => {
    const statements = splitSqlStatements(buildSqlScript(files));
    if (statements.length === 0) {
      setOutput({ statements: [], results: [], notice: "実行する SQL がありません" });
      setState("done");
      return;
    }
    const shown = statements.slice(0, SQL_MAX_STATEMENTS);
    const notice =
      statements.length > shown.length
        ? `SQL が多いため、先頭の ${SQL_MAX_STATEMENTS} 件だけ実行しました`
        : null;
    clearTimer();
    setOutput({ statements: shown, results: [], notice });
    setState("loading");

    // The worker keeps PGlite loaded between runs, so only the first run pays for the download.
    let worker = workerRef.current;
    if (!worker) {
      try {
        worker = new Worker(SQL_WORKER_URL, { type: "module" });
      } catch {
        setOutput({
          statements: shown,
          results: [],
          notice: "SQL の実行環境を開始できませんでした",
        });
        setState("done");
        return;
      }
      workerRef.current = worker;
    }
    const fail = (message: string) => {
      stopWorker();
      setOutput((prev) => ({
        statements: prev?.statements ?? shown,
        results: prev?.results ?? [],
        notice: message,
      }));
      setState("done");
    };
    timerRef.current = setTimeout(
      () => fail("実行環境の読み込みに時間がかかっています。再読み込みしてもう一度試してください"),
      SQL_LOAD_TIMEOUT_MS
    );
    worker.onmessage = (event: MessageEvent) => {
      const message = acceptSqlWorkerMessage(event.data);
      if (!message || workerRef.current !== worker) {
        return;
      }
      if (message.type === "ready") {
        setState("running");
        clearTimer();
        timerRef.current = setTimeout(
          () =>
            fail(
              "実行に時間がかかりすぎたので止めました。無限に続く問い合わせがないか確認してください"
            ),
          SQL_RUN_TIMEOUT_MS
        );
      } else if (message.type === "statement") {
        setOutput((prev) =>
          prev ? { ...prev, results: [...prev.results, message.result] } : prev
        );
      } else if (message.type === "done") {
        clearTimer();
        setState("done");
      } else {
        fail(`SQL の実行環境でエラーが起きました: ${message.message}`);
      }
    };
    worker.onerror = () => {
      if (workerRef.current === worker) {
        fail("SQL の実行環境を読み込めませんでした。通信を確認して、もう一度試してください");
      }
    };
    worker.postMessage({ statements: shown });
  };

  const busy = state === "loading" || state === "running";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">SQLの実行</span>
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
                  stopWorker();
                  setState("idle");
                  setOutput(null);
                }
                setOpen((o) => !o);
              }}
            >
              {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {open ? "閉じる" : "SQLの実行を表示"}
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="rounded-md border bg-muted/30">
          <div className="border-b px-3 py-1 text-xs font-medium text-muted-foreground">
            実行結果（PostgreSQL）
          </div>
          {output === null ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              「実行」を押すと、上から順に SQL
              を実行して、結果をここに表示します。毎回、空のデータベースから始まります。
            </p>
          ) : (
            <SqlOutput output={output} state={state} />
          )}
        </div>
      )}
    </div>
  );
}

function SqlOutput({ output, state }: { output: RunOutput; state: RunState }) {
  return (
    <div className="max-h-96 space-y-3 overflow-y-auto px-3 py-2">
      {state === "loading" && (
        <p className="text-xs text-muted-foreground">
          実行環境を準備しています（初回は数秒かかります）…
        </p>
      )}
      {output.results.map((result, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: results are append-only, one per statement.
          key={index}
          className="space-y-1"
        >
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
            {output.statements[index]}
          </pre>
          <SqlResult result={result} />
        </div>
      ))}
      {output.notice && <p className="text-xs text-destructive">{output.notice}</p>}
    </div>
  );
}

function SqlResult({ result }: { result: SqlStatementResult }) {
  if (result.kind === "error") {
    return (
      <p className="whitespace-pre-wrap break-all font-mono text-xs text-destructive">
        エラー: {result.message}
      </p>
    );
  }
  if (result.kind === "command") {
    return (
      <p className="font-mono text-xs">{formatSqlCommand(result.command, result.affectedRows)}</p>
    );
  }
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <table className="border-collapse font-mono text-xs">
          <thead>
            <tr>
              {result.fields.map((field, column) => (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: column names can repeat.
                  key={column}
                  className="border bg-muted px-2 py-1 text-left font-medium"
                >
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id.
              <tr key={rowIndex}>
                {row.map((cell, column) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: column names can repeat.
                    key={column}
                    className={cn(
                      "border px-2 py-1",
                      cell === null || cell === undefined ? "text-muted-foreground" : ""
                    )}
                  >
                    {formatSqlCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {result.totalRows} 行
        {result.totalRows > SQL_MAX_ROWS ? `（先頭の ${SQL_MAX_ROWS} 行だけ表示）` : ""}
      </p>
    </div>
  );
}

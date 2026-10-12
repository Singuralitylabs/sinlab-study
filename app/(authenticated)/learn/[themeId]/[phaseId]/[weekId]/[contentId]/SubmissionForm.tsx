"use client";

import { Code, Link as LinkIcon, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AIReviewDisplayNoSSR } from "@/app/components/AIReviewDisplayNoSSR";
import { CodeEditorNoSSR as CodeEditor } from "@/app/components/CodeEditorNoSSR";
import {
  buildDefaultFilename,
  CODE_LANGUAGE_OPTIONS,
  type CodeLanguage,
  DEFAULT_FILENAME_BY_LANGUAGE,
} from "@/app/components/code-editor-utils";
import { buildReviewNotice } from "@/app/lib/ai-review-response";
import type { AIReviewListItem, SubmissionType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CodeFileInput {
  id: string;
  filename: string;
  language: CodeLanguage;
  content: string;
  // Whether the user edited the filename by hand; while false, the default follows language
  // changes.
  filenameEdited: boolean;
}

interface SubmissionFormProps {
  contentId: number;
  allowedSubmissionTypes: "code" | "url" | "both";
  codeLanguage: CodeLanguage;
}

function buildFailedReview(errorMessage: string): AIReviewListItem {
  return {
    id: 0,
    status: "failed",
    review_content: null,
    overall_score: null,
    review_json: null,
    score_kind: "legacy",
    rubric_version: null,
    passed: null,
    error_message: errorMessage,
    reviewed_at: null,
  };
}

export function SubmissionForm({
  contentId,
  allowedSubmissionTypes,
  codeLanguage,
}: SubmissionFormProps) {
  const router = useRouter();
  const [submissionType, setSubmissionType] = useState<SubmissionType>(
    allowedSubmissionTypes === "url" ? "url" : "code"
  );
  const [codeFiles, setCodeFiles] = useState<CodeFileInput[]>([
    { id: "file-0", filename: "", language: codeLanguage, content: "", filenameEdited: false },
  ]);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [aiReview, setAiReview] = useState<AIReviewListItem | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const isMultiFile = codeFiles.length > 1;

  const updateCodeFile = (index: number, patch: Partial<CodeFileInput>) => {
    setCodeFiles((prev) => prev.map((file, i) => (i === index ? { ...file, ...patch } : file)));
  };

  const handleFilenameChange = (index: number, filename: string) => {
    updateCodeFile(index, { filename, filenameEdited: true });
  };

  const handleLanguageChange = (index: number, language: CodeLanguage) => {
    setCodeFiles((prev) =>
      prev.map((file, i) => {
        if (i !== index) {
          return file;
        }
        if (file.filenameEdited) {
          return { ...file, language };
        }
        const otherFilenames = prev.filter((_, j) => j !== index).map((f) => f.filename);
        return { ...file, language, filename: buildDefaultFilename(language, otherFilenames) };
      })
    );
  };

  const addCodeFile = () => {
    setCodeFiles((prev) => {
      // On the first single -> multi-file switch, fill default names for empty filenames (the
      // filename field is hidden and blank in single-file mode, so it would become required as soon
      // as it switches to multi).
      const assigned: string[] = prev
        .map((f) => f.filename)
        .filter((name) => name.trim().length > 0);
      const backfilled = prev.map((file) => {
        if (file.filename.trim().length > 0) {
          return file;
        }
        const filename = buildDefaultFilename(file.language, assigned);
        assigned.push(filename);
        return { ...file, filename };
      });
      const newFile: CodeFileInput = {
        id: crypto.randomUUID(),
        filename: buildDefaultFilename(codeLanguage, assigned),
        language: codeLanguage,
        content: "",
        filenameEdited: false,
      };
      return [...backfilled, newFile];
    });
  };

  const removeCodeFile = (index: number) => {
    setCodeFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const requestAIReview = async (
    submissionId: number,
    options: { submissionJustSaved: boolean }
  ) => {
    setIsReviewLoading(true);
    try {
      const response = await fetch("/api/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });

      const data = await response.json().catch(() => null);
      const isNoticeStatus = [202, 409, 429].includes(response.status);
      const notice = isNoticeStatus ? buildReviewNotice(response.status, data, options) : null;
      if (notice) {
        setMessage(notice);
        const reason = (data as { reason?: unknown } | null)?.reason;
        // A failed card left on screen hides a review the server already finished.
        const finishedElsewhere = response.status === 409 || reason === "submission_reviewed";
        if (finishedElsewhere) {
          setAiReview(null);
        }
        if (response.status === 202 || finishedElsewhere) {
          router.refresh();
        }
      } else if (response.ok && data?.review) {
        setAiReview({
          id: data.review.id,
          status: data.review.status,
          review_content: data.review.review_content,
          overall_score: data.review.overall_score,
          review_json: data.review.review_json ?? null,
          score_kind: data.review.score_kind ?? "legacy",
          rubric_version: data.review.rubric_version ?? null,
          passed: data.review.passed ?? null,
          error_message: null,
          reviewed_at: new Date().toISOString(),
        });
        setMessage({ type: "success", text: "提出が完了しました。AIレビューが生成されました。" });
        router.refresh();
      } else {
        const errorMsg = data?.error || "AIレビューの生成に失敗しました";
        setMessage({ type: "error", text: errorMsg });
        setAiReview(buildFailedReview(errorMsg));
      }
    } catch {
      const errorMsg = "ネットワークエラーが発生しました。再試行してください。";
      setMessage({ type: "error", text: errorMsg });
      setAiReview(buildFailedReview(errorMsg));
    } finally {
      setIsReviewLoading(false);
    }
  };

  const [lastSubmissionId, setLastSubmissionId] = useState<number | null>(null);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    setAiReview(null);

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId,
          submissionType,
          codeFiles:
            submissionType === "code"
              ? codeFiles.map((file) => ({
                  filename: file.filename,
                  language: file.language,
                  content: file.content,
                }))
              : null,
          url: submissionType === "url" ? url : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({ type: "success", text: "提出が完了しました。AIレビューを生成中..." });
        setCodeFiles([
          {
            id: "file-0",
            filename: "",
            language: codeLanguage,
            content: "",
            filenameEdited: false,
          },
        ]);
        setUrl("");

        const submissionId = data.submission.id;
        setLastSubmissionId(submissionId);
        requestAIReview(submissionId, { submissionJustSaved: true });
        router.refresh();
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "提出に失敗しました" });
      }
    } catch (error) {
      console.error("提出エラー:", error);
      setMessage({ type: "error", text: "提出に失敗しました" });
    } finally {
      setIsLoading(false);
    }
  };

  const isCodeValid =
    codeFiles.length > 0 &&
    codeFiles.every(
      (file) => file.content.trim().length > 0 && (!isMultiFile || file.filename.trim().length > 0)
    );

  const isValid =
    (submissionType === "code" && isCodeValid) ||
    (submissionType === "url" && url.trim().length > 0);

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {allowedSubmissionTypes === "both" && (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setSubmissionType("code")}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                submissionType === "code"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <Code className="h-5 w-5 mx-auto mb-1" />
              <span className="text-sm">コードで提出</span>
            </button>
            <button
              type="button"
              onClick={() => setSubmissionType("url")}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                submissionType === "url"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <LinkIcon className="h-5 w-5 mx-auto mb-1" />
              <span className="text-sm">URLで提出</span>
            </button>
          </div>
        )}

        {submissionType === "code" ? (
          <div className="space-y-3">
            {codeFiles.map((file, index) => (
              <div
                key={file.id}
                className={
                  isMultiFile ? "space-y-2 rounded-lg border border-border p-3" : "space-y-2"
                }
              >
                {isMultiFile ? (
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`filename-${index}`} className="text-xs">
                        ファイル名
                      </Label>
                      <Input
                        id={`filename-${index}`}
                        value={file.filename}
                        onChange={(e) => handleFilenameChange(index, e.target.value)}
                        placeholder={`例: ${DEFAULT_FILENAME_BY_LANGUAGE[file.language]}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`language-${index}`} className="text-xs">
                        言語
                      </Label>
                      <select
                        id={`language-${index}`}
                        value={file.language}
                        onChange={(e) =>
                          handleLanguageChange(index, e.target.value as CodeLanguage)
                        }
                        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        {CODE_LANGUAGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCodeFile(index)}
                      aria-label="このファイルを削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Label>コード</Label>
                )}
                <CodeEditor
                  value={file.content}
                  onChange={(value) => updateCodeFile(index, { content: value })}
                  language={file.language}
                  placeholder="ここにコードを貼り付けてください..."
                />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addCodeFile}>
              <Plus className="h-4 w-4" />
              ファイルを追加
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}

        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription className={message.type === "success" ? "text-success" : ""}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={!isValid || isLoading} className="w-full">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Send className="h-5 w-5" />
              提出する
            </>
          )}
        </Button>
      </form>

      <AIReviewDisplayNoSSR
        review={aiReview}
        isLoading={isReviewLoading}
        defaultExpanded={true}
        onRetry={
          lastSubmissionId && aiReview?.status === "failed"
            ? () => {
                requestAIReview(lastSubmissionId, { submissionJustSaved: false });
              }
            : undefined
        }
      />
    </div>
  );
}

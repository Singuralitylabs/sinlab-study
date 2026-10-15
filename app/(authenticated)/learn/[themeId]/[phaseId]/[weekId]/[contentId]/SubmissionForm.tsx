"use client";

import { Code, Link as LinkIcon, Loader2, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AIReviewDisplayNoSSR } from "@/app/components/AIReviewDisplayNoSSR";
import { CodeFilesEditor } from "@/app/components/CodeFilesEditor";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
import { HtmlPreviewNoSSR } from "@/app/components/HtmlPreviewNoSSR";
import { buildReviewNotice } from "@/app/lib/ai-review-response";
import {
  buildInitialCodeFiles,
  buildSubmissionCodeFiles,
  type CodeFileInput,
  isSubmissionCodeValid,
} from "@/app/lib/code-file-inputs";
import { canPreviewFiles } from "@/app/lib/html-preview";
import type { AIReviewListItem, CodeFile, SubmissionType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SubmissionFormProps {
  contentId: number;
  allowedSubmissionTypes: "code" | "url" | "both";
  codeLanguage: CodeLanguage;
  starterFiles?: CodeFile[] | null;
  /** Id of the completed review the page already renders for this submission. */
  persistedReviewId: number | null;
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
  starterFiles = null,
  persistedReviewId,
}: SubmissionFormProps) {
  const router = useRouter();
  const [submissionType, setSubmissionType] = useState<SubmissionType>(
    allowedSubmissionTypes === "url" ? "url" : "code"
  );
  const [codeFiles, setCodeFiles] = useState<CodeFileInput[]>(() =>
    buildInitialCodeFiles(starterFiles, codeLanguage)
  );
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [aiReview, setAiReview] = useState<AIReviewListItem | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const hasStarter = Boolean(starterFiles && starterFiles.length > 0);
  // Judged by the files' own languages so the UI never appears for non-web exercises.
  const showPreview = submissionType === "code" && canPreviewFiles(codeFiles);
  const emptyShellCount = codeFiles.filter((file) => file.content.trim().length === 0).length;
  const hasSubmittableCode = codeFiles.some((file) => file.content.trim().length > 0);

  const resetToStarter = () => {
    setCodeFiles(buildInitialCodeFiles(starterFiles, codeLanguage));
  };

  const handleResetToStarter = () => {
    if (!confirm("編集中のコードを破棄して、初期コードに戻しますか？")) {
      return;
    }
    resetToStarter();
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
  // refresh keeps this card, so the page and the form would show the same completed row.
  const pageShowsThisReview =
    aiReview?.status === "completed" &&
    persistedReviewId != null &&
    aiReview.id === persistedReviewId;

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
            submissionType === "code" ? buildSubmissionCodeFiles(codeFiles, codeLanguage) : null,
          url: submissionType === "url" ? url : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({ type: "success", text: "提出が完了しました。AIレビューを生成中..." });
        resetToStarter();
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

  const isCodeValid = isSubmissionCodeValid(codeFiles);

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
            <CodeFilesEditor
              files={codeFiles}
              onChange={setCodeFiles}
              defaultLanguage={codeLanguage}
            />
            {hasStarter && (
              <Button type="button" variant="outline" size="sm" onClick={handleResetToStarter}>
                <RotateCcw className="h-4 w-4" />
                初期コードに戻す
              </Button>
            )}
            {hasSubmittableCode && emptyShellCount > 0 && (
              <p className="text-xs text-muted-foreground">
                内容が空のファイルは提出に含めません。
              </p>
            )}
            {showPreview && (
              <HtmlPreviewNoSSR
                files={codeFiles.map(({ filename, language, content }) => ({
                  filename,
                  language,
                  content,
                }))}
              />
            )}
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

      {!pageShowsThisReview && (
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
      )}
    </div>
  );
}

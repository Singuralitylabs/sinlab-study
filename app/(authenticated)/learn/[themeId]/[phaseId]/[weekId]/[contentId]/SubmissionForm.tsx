"use client";

import { Code, Link as LinkIcon, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { AIReviewDisplay } from "@/app/components/AIReviewDisplay";
import type { AIReview, SubmissionType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SubmissionFormProps {
  contentId: number;
  userId: number;
}

export function SubmissionForm({ contentId, userId }: SubmissionFormProps) {
  const [submissionType, setSubmissionType] = useState<SubmissionType>("code");
  const [codeContent, setCodeContent] = useState("");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const requestAIReview = async (submissionId: number) => {
    setIsReviewLoading(true);
    try {
      const response = await fetch("/api/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiReview({
          id: data.review.id,
          submission_id: submissionId,
          status: data.review.status,
          review_content: data.review.review_content,
          overall_score: data.review.overall_score,
          model_used: data.review.model_used,
          prompt_tokens: null,
          completion_tokens: null,
          error_message: null,
          reviewed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setMessage({ type: "success", text: "提出が完了しました。AIレビューが生成されました。" });
      } else if (response.status === 429) {
        const errorData = await response.json().catch(() => null);
        setMessage({
          type: "success",
          text: errorData?.error ?? "この課題のAIレビューは利用済みです",
        });
      } else {
        const errorData = await response.json().catch(() => null);
        const errorMsg = errorData?.error || "AIレビューの生成に失敗しました";
        setMessage({ type: "error", text: errorMsg });
        setAiReview({
          id: 0,
          submission_id: submissionId,
          status: "failed",
          review_content: null,
          overall_score: null,
          model_used: null,
          prompt_tokens: null,
          completion_tokens: null,
          error_message: errorMsg,
          reviewed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch {
      setMessage({ type: "error", text: "ネットワークエラーが発生しました。再試行してください。" });
      setAiReview({
        id: 0,
        submission_id: submissionId,
        status: "failed",
        review_content: null,
        overall_score: null,
        model_used: null,
        prompt_tokens: null,
        completion_tokens: null,
        error_message: "ネットワークエラーが発生しました。再試行してください。",
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } finally {
      setIsReviewLoading(false);
    }
  };

  const [lastSubmissionId, setLastSubmissionId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
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
          userId,
          submissionType,
          codeContent: submissionType === "code" ? codeContent : null,
          url: submissionType === "url" ? url : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({ type: "success", text: "提出が完了しました。AIレビューを生成中..." });
        setCodeContent("");
        setUrl("");

        const submissionId = data.submission.id;
        setLastSubmissionId(submissionId);
        requestAIReview(submissionId);
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

  const isValid =
    (submissionType === "code" && codeContent.trim().length > 0) ||
    (submissionType === "url" && url.trim().length > 0);

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 提出タイプ選択 */}
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

        {/* 入力フィールド */}
        {submissionType === "code" ? (
          <div className="space-y-2">
            <Label htmlFor="code">コード</Label>
            <Textarea
              id="code"
              value={codeContent}
              onChange={(e) => setCodeContent(e.target.value)}
              className="font-mono min-h-[200px]"
              placeholder="ここにコードを貼り付けてください..."
            />
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

        {/* メッセージ */}
        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription className={message.type === "success" ? "text-success" : ""}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        {/* 提出ボタン */}
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

      {/* AIレビュー表示 */}
      <AIReviewDisplay
        review={aiReview}
        isLoading={isReviewLoading}
        defaultExpanded={true}
        onRetry={
          lastSubmissionId
            ? () => {
                setAiReview(null);
                requestAIReview(lastSubmissionId);
              }
            : undefined
        }
      />
    </div>
  );
}

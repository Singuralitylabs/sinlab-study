"use client";

import { Code, Link as LinkIcon, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AIReviewDisplay } from "@/app/components/AIReviewDisplay";
import { CodeEditorNoSSR as CodeEditor } from "@/app/components/CodeEditorNoSSR";
import {
  buildDefaultFilename,
  type CodeLanguage,
  DEFAULT_FILENAME_BY_LANGUAGE,
} from "@/app/components/code-editor-utils";
import type { AIReview, SubmissionType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CODE_LANGUAGE_OPTIONS: { value: CodeLanguage; label: string }[] = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "gas", label: "GAS" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
];

interface CodeFileInput {
  id: string;
  filename: string;
  language: CodeLanguage;
  content: string;
  // ユーザーがファイル名を手動編集したか。false の間は言語変更にあわせて初期値を自動更新する
  filenameEdited: boolean;
}

interface SubmissionFormProps {
  contentId: number;
  allowedSubmissionTypes: "code" | "url" | "both";
  codeLanguage: CodeLanguage;
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const isMultiFile = codeFiles.length > 1;

  const updateCodeFile = (index: number, patch: Partial<CodeFileInput>) => {
    setCodeFiles((prev) => prev.map((file, i) => (i === index ? { ...file, ...patch } : file)));
  };

  // ファイル名入力欄の変更。手動編集とみなし、以後は言語変更で初期値を上書きしない
  const handleFilenameChange = (index: number, filename: string) => {
    updateCodeFile(index, { filename, filenameEdited: true });
  };

  // 言語変更。ファイル名が未編集なら、新しい言語のデフォルト名へ追従させる
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
      // 単一→複数ファイル化の初回は、ファイル名が空のファイルにデフォルト名を補完する
      // （単一ファイル時はファイル名欄が非表示で未入力のため、複数化と同時に必須化される対策）
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
          type: "error",
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
        requestAIReview(submissionId);
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

  // コード提出: 全ファイルにコードがあり、複数ファイル時はファイル名も必須
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
        {/* 提出タイプ選択（both のときのみ表示） */}
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

        {/* 入力フィールド */}
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
                  minHeight="200px"
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

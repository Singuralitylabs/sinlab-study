"use client";

import {
  Bot,
  Code,
  FlaskConical,
  Link as LinkIcon,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { AIReviewDisplay } from "@/app/components/AIReviewDisplay";
import { CodeEditor, type CodeLanguage } from "@/app/components/CodeEditor";
import type { AIReview, SubmissionType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CODE_LANGUAGE_OPTIONS: { value: CodeLanguage; label: string }[] = [
  { value: "javascript", label: "JavaScript / GAS" },
  { value: "typescript", label: "TypeScript" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
];

interface CodeFileInput {
  id: string;
  filename: string;
  language: CodeLanguage;
  content: string;
}

// デモ用のサンプルAIレビュー（実際のAPI呼び出しは行わない）
const SAMPLE_REVIEW: AIReview = {
  id: 0,
  submission_id: 0,
  status: "completed",
  review_content: `## 総評

提出内容を拝見しました。課題の要件を理解した上で取り組まれており、全体的な方向性は正しいです。

## 良い点

- コードの基本構造が適切に組み立てられています
- 変数名や関数名が処理内容を反映しており、可読性が高いです
- 処理の流れが論理的に組み立てられています

## 改善できる点

- エラーハンドリングを追加することで、より堅牢なコードになります
- 処理を小さな関数に分割することで、再利用性と保守性が向上します
- コメントを適切に追加することで、コードの意図がより明確になります

## まとめ

基礎的な実装はできています。本番環境では提出されたコードの内容に基づいた詳細なフィードバックをお届けします。`,
  overall_score: 75,
  model_used: "sample",
  prompt_tokens: null,
  completion_tokens: null,
  error_message: null,
  reviewed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

interface DemoSubmissionFormProps {
  allowedSubmissionTypes: "code" | "url" | "both";
  codeLanguage: CodeLanguage;
}

export function DemoSubmissionForm({
  allowedSubmissionTypes,
  codeLanguage,
}: DemoSubmissionFormProps) {
  const [submissionType, setSubmissionType] = useState<SubmissionType>(
    allowedSubmissionTypes === "url" ? "url" : "code"
  );
  const [codeFiles, setCodeFiles] = useState<CodeFileInput[]>([
    { id: "file-0", filename: "", language: codeLanguage, content: "" },
  ]);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const isMultiFile = codeFiles.length > 1;

  const updateCodeFile = (index: number, patch: Partial<CodeFileInput>) => {
    setCodeFiles((prev) => prev.map((file, i) => (i === index ? { ...file, ...patch } : file)));
  };

  const addCodeFile = () => {
    setCodeFiles((prev) => [
      ...prev,
      { id: crypto.randomUUID(), filename: "", language: codeLanguage, content: "" },
    ]);
  };

  const removeCodeFile = (index: number) => {
    setCodeFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsReviewLoading(true);
    setAiReview(null);

    // API呼び出しを行わず、サンプルレビューを表示する
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsLoading(false);
    setIsReviewLoading(false);
    setAiReview(SAMPLE_REVIEW);
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
                      <Label htmlFor={`demo-filename-${index}`} className="text-xs">
                        ファイル名
                      </Label>
                      <Input
                        id={`demo-filename-${index}`}
                        value={file.filename}
                        onChange={(e) => updateCodeFile(index, { filename: e.target.value })}
                        placeholder="例: コード.gs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`demo-language-${index}`} className="text-xs">
                        言語
                      </Label>
                      <select
                        id={`demo-language-${index}`}
                        value={file.language}
                        onChange={(e) =>
                          updateCodeFile(index, { language: e.target.value as CodeLanguage })
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
            <Label htmlFor="demo-url">URL</Label>
            <Input
              type="url"
              id="demo-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}

        <Button type="submit" disabled={!isValid || isLoading} className="w-full">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Send className="h-5 w-5" />
              提出してAIレビューを受ける
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          ※ デモアプリでは実際のAIレビューは行われません。サンプルのレビュー結果が表示されます。
        </p>
      </form>

      {aiReview && (
        <Alert className="border-primary/30 bg-primary/5">
          <Bot className="h-4 w-4 text-primary" />
          <AlertDescription className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              <strong>これはサンプルレビューです。</strong>
              本番環境では提出内容に基づいた詳細なAIフィードバックが届きます。
            </span>
          </AlertDescription>
        </Alert>
      )}

      <AIReviewDisplay review={aiReview} isLoading={isReviewLoading} defaultExpanded={true} />
    </div>
  );
}

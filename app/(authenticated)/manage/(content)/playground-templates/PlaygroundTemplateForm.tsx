"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type PlaygroundEditorFile,
  PlaygroundFilesEditor,
  withoutPlaygroundFileIds,
  withPlaygroundFileIds,
} from "@/app/components/playground/PlaygroundFilesEditor";
import { PlaygroundRunPanel } from "@/app/components/playground/PlaygroundRunPanel";
import {
  MANAGE_PLAYGROUND_TEMPLATES_PATH,
  PLAYGROUND_KIND_LABELS,
  PLAYGROUND_KINDS,
  PLAYGROUND_TEMPLATE_TITLE_MAX_LENGTH,
  type PlaygroundKind,
} from "@/app/constants/playground";
import {
  defaultPlaygroundFiles,
  type PlaygroundFileInput,
  playgroundFilesError,
} from "@/app/lib/playground";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PlaygroundTemplateFormProps {
  mode: "create" | "edit";
  initialData?: {
    id: number;
    title: string;
    kind: PlaygroundKind;
    files: PlaygroundFileInput[];
    isPublished: boolean;
  };
}

export function PlaygroundTemplateForm({ mode, initialData }: PlaygroundTemplateFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [kind, setKind] = useState<PlaygroundKind>(initialData?.kind ?? "web");
  const [files, setFiles] = useState<PlaygroundEditorFile[]>(() =>
    withPlaygroundFileIds(initialData?.files ?? defaultPlaygroundFiles("web"))
  );
  const [isPublished, setIsPublished] = useState(initialData?.isPublished ?? false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const plainFiles = withoutPlaygroundFileIds(files);
  const filesError = playgroundFilesError(kind, plainFiles);

  // Files of one kind are invalid in another (extensions are per kind), so switching starts over.
  const changeKind = (next: PlaygroundKind) => {
    if (next === kind) {
      return;
    }
    setKind(next);
    setFiles(withPlaygroundFileIds(defaultPlaygroundFiles(next)));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const url =
        mode === "create"
          ? "/api/manage/playground-templates"
          : `/api/manage/playground-templates/${initialData?.id}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kind, files: plainFiles, is_published: isPublished }),
      });
      if (response.ok) {
        router.push(MANAGE_PLAYGROUND_TEMPLATES_PATH);
        router.refresh();
        return;
      }
      const data = await response.json().catch(() => null);
      setErrorMessage(data?.error || "保存に失敗しました");
    } catch {
      setErrorMessage("保存中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label htmlFor="title">題名</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={PLAYGROUND_TEMPLATE_TITLE_MAX_LENGTH}
              placeholder="例: 体験会 ボタンを押すと色が変わる"
              required
            />
            <p className="text-sm text-muted-foreground">リンクを開いた人の画面に表示されます。</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">実行の種類</legend>
            <div className="flex flex-wrap gap-2">
              {PLAYGROUND_KINDS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={option === kind ? "default" : "outline"}
                  aria-pressed={option === kind}
                  onClick={() => changeKind(option)}
                >
                  {PLAYGROUND_KIND_LABELS[option]}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              種類を変えると、ファイルは最初の状態に戻ります。
            </p>
          </fieldset>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <span className="text-sm font-medium">ファイル</span>
              <PlaygroundFilesEditor key={kind} kind={kind} files={files} onChange={setFiles} />
              {filesError && <p className="text-sm text-destructive">{filesError}</p>}
            </div>
            <div className="min-w-0 space-y-2">
              <span className="text-sm font-medium">動作確認</span>
              <PlaygroundRunPanel kind={kind} files={plainFiles} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isPublished"
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="isPublished">公開する（受講者がリンクから開けるようにする）</Label>
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading || !title.trim() || filesError !== null}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {mode === "create" ? "作成" : "更新"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(MANAGE_PLAYGROUND_TEMPLATES_PATH)}
            >
              キャンセル
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

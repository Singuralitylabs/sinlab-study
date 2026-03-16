"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LearningPhase, LearningTheme } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PhaseFormProps {
  themes: LearningTheme[];
  initialData?: LearningPhase;
  mode: "create" | "edit";
}

export function PhaseForm({ themes, initialData, mode }: PhaseFormProps) {
  const router = useRouter();

  const [themeId, setThemeId] = useState(initialData?.theme_id?.toString() ?? "");
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [displayOrder, setDisplayOrder] = useState(initialData?.display_order?.toString() ?? "0");
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const body = {
      theme_id: Number(themeId),
      name,
      description: description || null,
      display_order: Number(displayOrder),
      is_published: isPublished,
    };

    try {
      const url =
        mode === "create" ? "/api/manage/phases" : `/api/manage/phases/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setMessage({
          type: "success",
          text: mode === "create" ? "フェーズを作成しました" : "フェーズを更新しました",
        });
        router.push("/manage/phases");
        router.refresh();
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "保存に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "保存中にエラーが発生しました" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label htmlFor="themeId">テーマ</Label>
            <select
              id="themeId"
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              required
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              <option value="">選択してください</option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">フェーズ名</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="フェーズの名前"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="フェーズの説明（任意）"
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayOrder">表示順</Label>
            <Input
              id="displayOrder"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              className="w-24"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isPublished"
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="isPublished">公開する</Label>
          </div>

          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              <AlertDescription className={message.type === "success" ? "text-success" : ""}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading || !name || !themeId}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {mode === "create" ? "作成" : "更新"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/manage/phases")}>
              キャンセル
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

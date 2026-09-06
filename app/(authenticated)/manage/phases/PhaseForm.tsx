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
import {
  getCurrentPositionInsertAfterId,
  getDefaultInsertAfterId,
  type SiblingCandidate,
  SiblingOrderField,
} from "../components/SiblingOrderField";

interface PhaseFormProps {
  themes: LearningTheme[];
  initialData?: LearningPhase;
  /**
   * 挿入位置ピッカーに表示する全フェーズ候補。作成モードは対象そのもの、編集モードは
   * 編集対象自身を含む一覧を渡す（自分自身の現在位置を求めるため。表示直前にフォーム内で
   * 自分自身を除く）。
   */
  siblingCandidates?: SiblingCandidate[];
  mode: "create" | "edit";
}

export function PhaseForm({ themes, initialData, siblingCandidates = [], mode }: PhaseFormProps) {
  const router = useRouter();

  const [themeId, setThemeId] = useState(initialData?.theme_id?.toString() ?? "");
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const allSiblingsForTheme = siblingCandidates.filter((c) => String(c.parentId) === themeId);
  const visibleSiblings = allSiblingsForTheme.filter((c) => c.id !== initialData?.id);
  const [insertAfterId, setInsertAfterId] = useState(() =>
    mode === "edit" && initialData
      ? getCurrentPositionInsertAfterId(initialData.id, allSiblingsForTheme)
      : getDefaultInsertAfterId(allSiblingsForTheme)
  );
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleThemeChange(value: string) {
    setThemeId(value);
    const newVisibleSiblings = siblingCandidates
      .filter((c) => String(c.parentId) === value)
      .filter((c) => c.id !== initialData?.id);
    setInsertAfterId(getDefaultInsertAfterId(newVisibleSiblings));
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const body = {
      theme_id: Number(themeId),
      name,
      description: description || null,
      insert_after_id: insertAfterId,
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
              onChange={(e) => handleThemeChange(e.target.value)}
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

          <SiblingOrderField
            siblings={themeId ? visibleSiblings : null}
            insertAfterId={insertAfterId}
            onChange={setInsertAfterId}
            placeholderLabel={mode === "create" ? "ここに追加" : "ここに移動"}
          />

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

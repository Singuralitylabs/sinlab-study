"use client";

import { Loader2, Save } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { resolveStorageUrl } from "@/app/lib/storage-url";
import type { LearningTheme } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ThemeFormProps {
  initialData?: LearningTheme;
  mode: "create" | "edit";
}

export function ThemeForm({ initialData, mode }: ThemeFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initialData?.image_url ?? "");
  const [displayOrder, setDisplayOrder] = useState(initialData?.display_order?.toString() ?? "0");
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    // アップロード中の送信は、フォームが保持する古い image_url でアップロード結果を
    // 上書きしてしまうため受け付けない（送信ボタンの disabled と二重の防御）
    if (isUploading) return;
    setIsLoading(true);
    setMessage(null);

    const body = {
      name,
      description: description || null,
      image_url: imageUrl || null,
      display_order: Number(displayOrder),
      is_published: isPublished,
    };

    try {
      const url =
        mode === "create" ? "/api/manage/themes" : `/api/manage/themes/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setMessage({
          type: "success",
          text: mode === "create" ? "テーマを作成しました" : "テーマを更新しました",
        });
        router.push("/manage/themes");
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

  const handleThumbnailUpload = async (file: File | undefined) => {
    if (!file || !initialData) return;

    setIsUploading(true);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("themeId", String(initialData.id));

    try {
      const response = await fetch("/api/upload-thumbnail", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "画像のアップロードに失敗しました" });
        return;
      }
      setImageUrl(data.path);
      setMessage({
        type: "success",
        text: "画像をアップロードして保存しました",
      });
    } catch {
      setMessage({ type: "error", text: "画像のアップロード中にエラーが発生しました" });
    } finally {
      setIsUploading(false);
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = "";
      }
    }
  };

  const handleThumbnailDelete = async () => {
    if (!initialData) return;

    setIsUploading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/upload-thumbnail?themeId=${initialData.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "画像の削除に失敗しました" });
        return;
      }
      setImageUrl("");
      setMessage(
        data.storageRemoved === false
          ? {
              type: "error",
              text: "テーマから画像を削除しましたが、ストレージ上のファイルが残っている可能性があります",
            }
          : { type: "success", text: "画像を削除しました" }
      );
    } catch {
      setMessage({ type: "error", text: "画像の削除中にエラーが発生しました" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label htmlFor="name">テーマ名</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="テーマの名前"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="テーマの説明（任意）"
              className="min-h-[100px]"
            />
          </div>

          {mode === "edit" ? (
            <div className="space-y-3">
              <Label htmlFor="thumbnail">サムネイル画像</Label>
              {imageUrl && (
                <div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-md border bg-linear-to-br from-primary/5 to-primary/15">
                  <Image
                    src={resolveStorageUrl(imageUrl)}
                    alt="サムネイルのプレビュー"
                    fill
                    className="object-contain"
                    sizes="320px"
                  />
                </div>
              )}
              <Input
                ref={thumbnailInputRef}
                id="thumbnail"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={isUploading}
                onChange={(event) => handleThumbnailUpload(event.target.files?.[0])}
              />
              {imageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploading}
                  onClick={handleThumbnailDelete}
                >
                  画像を削除
                </Button>
              )}
              <p className="text-sm text-muted-foreground">PNG、JPEG、WebP形式、5MBまで</p>
              {isUploading && <p className="text-sm text-muted-foreground">アップロード中です…</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>サムネイル画像</Label>
              <p className="text-sm text-muted-foreground">
                テーマを作成した後、編集画面から画像をアップロードできます。
              </p>
            </div>
          )}

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
            <Button type="submit" disabled={isLoading || isUploading || !name}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {mode === "create" ? "作成" : "更新"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/manage/themes")}>
              キャンセル
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

"use client";

import { Loader2, Save, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
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
import {
  getCurrentPositionInsertAfterId,
  getDefaultInsertAfterId,
  SiblingOrderField,
  type SiblingOrderItem,
} from "../../components/SiblingOrderField";

interface ThemeFormProps {
  initialData?: LearningTheme;
  /**
   * All themes for the insert-position picker (sorted). Create mode passes the targets themselves;
   * edit mode passes a list including the edited theme itself (to find its current position;
   * removed inside the form before display).
   */
  siblings?: SiblingOrderItem[];
  mode: "create" | "edit";
  /** Dialog embedding: close and expand the created/updated node instead of navigating away. */
  onSuccess?: (result?: { id: number }) => void;
  onCancel?: () => void;
  /** Skip Card chrome so the form sits cleanly inside a Dialog. */
  embedded?: boolean;
}

type ImageKind = "thumbnail" | "hero";

interface ImageFieldProps {
  id: string;
  label: string;
  previewAlt: string;
  previewClassName: string;
  previewSizes: string;
  hint: string;
  imageUrl: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onUpload: (file: File | undefined) => void;
  onDelete: () => void;
}

function ImageField({
  id,
  label,
  previewAlt,
  previewClassName,
  previewSizes,
  hint,
  imageUrl,
  inputRef,
  disabled,
  onUpload,
  onDelete,
}: ImageFieldProps) {
  return (
    <div className="space-y-3">
      <Label htmlFor={id}>{label}</Label>
      {imageUrl && (
        <div
          className={`relative w-full overflow-hidden rounded-md border bg-linear-to-br from-primary/5 to-primary/15 ${previewClassName}`}
        >
          <Image
            src={resolveStorageUrl(imageUrl)}
            alt={previewAlt}
            fill
            className="object-contain"
            sizes={previewSizes}
          />
        </div>
      )}
      <Input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(event) => onUpload(event.target.files?.[0])}
      />
      {imageUrl && (
        <Button type="button" variant="outline" disabled={disabled} onClick={onDelete}>
          画像を削除
        </Button>
      )}
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function parseCreatedThemeId(data: unknown): number | undefined {
  if (!data || typeof data !== "object" || !("theme" in data)) return undefined;
  const id = (data as { theme?: { id?: unknown } }).theme?.id;
  return typeof id === "number" ? id : undefined;
}

export function ThemeForm({
  initialData,
  siblings = [],
  mode,
  onSuccess,
  onCancel,
  embedded = false,
}: ThemeFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initialData?.image_url ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(initialData?.hero_image_url ?? "");
  const visibleSiblings = siblings.filter((s) => s.id !== initialData?.id);
  const [insertAfterId, setInsertAfterId] = useState(() =>
    mode === "edit" && initialData
      ? getCurrentPositionInsertAfterId(initialData.id, siblings)
      : getDefaultInsertAfterId(siblings)
  );
  // Omit insert_after_id from the PUT body when the position wasn't touched: the server leaves
  // display order alone when it's omitted, which avoids unrelated saves failing or being reverted
  // when the sibling list is stale.
  const initialInsertAfterId = useRef(insertAfterId);
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Reject submits during upload: they'd overwrite the upload result with the stale image_url the
    // form holds (double protection with the button's disabled state).
    if (isUploading) return;
    setIsLoading(true);
    setMessage(null);

    const body = {
      name,
      description: description || null,
      image_url: imageUrl || null,
      insert_after_id:
        mode === "edit" && insertAfterId === initialInsertAfterId.current
          ? undefined
          : insertAfterId,
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
        const data: unknown = await response.json().catch(() => null);
        setMessage({
          type: "success",
          text: mode === "create" ? "テーマを作成しました" : "テーマを更新しました",
        });
        const id = mode === "edit" && initialData ? initialData.id : parseCreatedThemeId(data);
        if (onSuccess) {
          // Caller (e.g. ContentTree) refreshes after expanding the created node.
          onSuccess(id !== undefined ? { id } : undefined);
        } else {
          router.push("/manage/contents");
          router.refresh();
        }
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

  const handleImageUpload = async (kind: ImageKind, file: File | undefined) => {
    if (!file || !initialData) return;

    setIsUploading(true);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("themeId", String(initialData.id));
    formData.append("kind", kind);

    try {
      const response = await fetch("/api/upload-thumbnail", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "画像のアップロードに失敗しました" });
        return;
      }
      (kind === "hero" ? setHeroImageUrl : setImageUrl)(data.path);
      setMessage({
        type: "success",
        text: "画像をアップロードして保存しました",
      });
    } catch {
      setMessage({ type: "error", text: "画像のアップロード中にエラーが発生しました" });
    } finally {
      setIsUploading(false);
      const input = kind === "hero" ? heroInputRef.current : thumbnailInputRef.current;
      if (input) input.value = "";
    }
  };

  const handleImageDelete = async (kind: ImageKind) => {
    if (!initialData) return;

    setIsUploading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/upload-thumbnail?themeId=${initialData.id}&kind=${kind}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "画像の削除に失敗しました" });
        return;
      }
      (kind === "hero" ? setHeroImageUrl : setImageUrl)("");
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

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    router.push("/manage/contents");
  };

  const fields = (
    <>
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
        <>
          <ImageField
            id="thumbnail"
            label="サムネイル画像"
            previewAlt="サムネイルのプレビュー"
            previewClassName="aspect-video max-w-xs"
            previewSizes="320px"
            hint="テーマ一覧のカードに表示します。PNG、JPEG、WebP形式、5MBまで"
            imageUrl={imageUrl}
            inputRef={thumbnailInputRef}
            disabled={isUploading}
            onUpload={(file) => handleImageUpload("thumbnail", file)}
            onDelete={() => handleImageDelete("thumbnail")}
          />
          <ImageField
            id="heroImage"
            label="ヒーロー画像（任意）"
            previewAlt="ヒーロー画像のプレビュー"
            previewClassName="aspect-[16/5] max-w-md"
            previewSizes="448px"
            hint="フェーズ一覧の冒頭に表示する横長（16:5）の画像です。未設定のときは、サムネイル画像の上下を切り抜いて表示します。PNG、JPEG、WebP形式、5MBまで"
            imageUrl={heroImageUrl}
            inputRef={heroInputRef}
            disabled={isUploading}
            onUpload={(file) => handleImageUpload("hero", file)}
            onDelete={() => handleImageDelete("hero")}
          />
          {isUploading && <p className="text-sm text-muted-foreground">アップロード中です…</p>}
        </>
      ) : (
        <div className="space-y-2">
          <Label>サムネイル画像・ヒーロー画像</Label>
          <p className="text-sm text-muted-foreground">
            テーマを作成した後、編集画面から画像をアップロードできます。
          </p>
        </div>
      )}

      <SiblingOrderField
        siblings={visibleSiblings}
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

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isLoading || isUploading || !name}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "作成" : "更新"}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel}>
          キャンセル
        </Button>
        {mode === "edit" && !embedded && initialData && (
          <Button
            asChild
            variant="ghost"
            title="削除"
            className="ml-auto text-destructive hover:text-destructive"
          >
            <Link href={`/manage/themes/${initialData.id}/delete`}>
              <Trash2 className="h-4 w-4" />
              削除
            </Link>
          </Button>
        )}
      </div>
    </>
  );

  return (
    <form onSubmit={handleSubmit}>
      {embedded ? (
        <div className="space-y-6">{fields}</div>
      ) : (
        <Card>
          <CardContent className="space-y-6 pt-6">{fields}</CardContent>
        </Card>
      )}
    </form>
  );
}

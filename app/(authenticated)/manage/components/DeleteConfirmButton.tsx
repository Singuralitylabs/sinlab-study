"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSlideStorageWarning } from "@/app/lib/slide-storage-warning";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface DeleteConfirmButtonProps {
  deleteUrl: string;
  backUrl: string;
}

export function DeleteConfirmButton({ deleteUrl, backUrl }: DeleteConfirmButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // DB 側の削除は成功したが、スライドPDFが Storage に残った場合の警告（issue #241）
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const backToList = () => {
    router.push(backUrl);
    router.refresh();
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(deleteUrl, { method: "DELETE" });
      if (response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const warning = getSlideStorageWarning(data, "delete");
        if (warning) {
          // 削除済みのため再実行はさせず、警告を読んでから一覧へ戻れるようにする
          // （この画面を refresh すると削除済みの対象が見つからず 404 になるため refresh しない）
          setWarningMessage(warning);
          return;
        }
        backToList();
      } else {
        const data = await response.json();
        setErrorMessage(data.error || "削除に失敗しました");
      }
    } catch {
      setErrorMessage("削除中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  if (warningMessage) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{warningMessage}</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={backToList}>
          一覧へ戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-3">
        <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          削除する
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(backUrl)}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}

"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

  const handleDelete = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(deleteUrl, { method: "DELETE" });
      if (response.ok) {
        router.push(backUrl);
        router.refresh();
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

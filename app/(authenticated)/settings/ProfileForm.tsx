"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { parseDisplayName } from "@/app/lib/display-name";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProfileFormProps {
  initialDisplayName: string;
}

export function ProfileForm({ initialDisplayName }: ProfileFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The page is a server component. After a save, refresh() re-fetches the stored name so the
  // input matches the row (and any other server-rendered name on this navigation).
  useEffect(() => {
    setDisplayName(initialDisplayName);
  }, [initialDisplayName]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);

    const parsed = parseDisplayName(displayName);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: parsed.name }),
      });
      const body = (await response.json().catch(() => null)) as {
        displayName?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.displayName) {
        setErrorMessage(
          body?.error ?? "表示名を更新できませんでした。時間をおいて再度お試しください。"
        );
        return;
      }
      setDisplayName(body.displayName);
      setSaved(true);
      router.refresh();
    } catch (error) {
      console.error("表示名の更新エラー:", error);
      setErrorMessage("表示名を更新できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="display-name">表示名</Label>
        <Input
          id="display-name"
          name="displayName"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setErrorMessage(null);
            setSaved(false);
          }}
          autoComplete="name"
          disabled={isLoading}
        />
        <p className="text-sm text-muted-foreground">
          修了証には発行時点の名前が印字されます。発行済みの修了証には反映されません。
        </p>
      </div>
      <Button type="submit" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        保存する
      </Button>
      {saved && <p className="text-sm text-muted-foreground">保存しました</p>}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

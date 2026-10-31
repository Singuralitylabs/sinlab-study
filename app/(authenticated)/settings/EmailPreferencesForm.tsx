"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { formatDateTimeMinute } from "@/app/lib/format-date";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface EmailPreferencesFormProps {
  initialEmailOptOutAt: string | null;
}

export function EmailPreferencesForm({ initialEmailOptOutAt }: EmailPreferencesFormProps) {
  const [emailOptOutAt, setEmailOptOutAt] = useState(initialEmailOptOutAt);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOptedOut = emailOptOutAt !== null;

  const handleToggle = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/settings/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // The new desired state: resume (true) when currently stopped, stop (false) otherwise.
        body: JSON.stringify({ promotionalEmails: isOptedOut }),
      });
      if (!response.ok) {
        setErrorMessage("配信設定を更新できませんでした。時間をおいて再度お試しください。");
        return;
      }
      // Show the stored state the server returned, not the one we asked for.
      const data = (await response.json()) as { emailOptOutAt: string | null };
      setEmailOptOutAt(data.emailOptOutAt);
    } catch (error) {
      console.error("配信設定の更新エラー:", error);
      setErrorMessage("配信設定を更新できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">現在の状態</span>
            <Badge variant={isOptedOut ? "secondary" : "default"}>
              {isOptedOut ? "停止中" : "配信中"}
            </Badge>
          </div>
          {emailOptOutAt && (
            <p className="text-sm text-muted-foreground">
              停止日時: {formatDateTimeMinute(emailOptOutAt)}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant={isOptedOut ? "default" : "outline"}
          onClick={handleToggle}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isOptedOut ? "案内メールの配信を再開する" : "案内メールの配信を停止する"}
        </Button>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

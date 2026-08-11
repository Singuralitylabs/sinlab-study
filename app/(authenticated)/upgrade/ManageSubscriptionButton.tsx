"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ManageSubscriptionButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "お支払い情報の管理画面を開けませんでした");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("エラーが発生しました");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={isLoading} variant="outline" className="w-full">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "お支払い情報の管理・解約"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

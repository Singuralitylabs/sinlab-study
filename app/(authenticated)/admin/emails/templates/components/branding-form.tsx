"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  serviceName: string;
  serviceSubtitle: string;
  nameMax: number;
  subtitleMax: number;
  updatedLabel: string | null;
};

export function BrandingForm({
  serviceName,
  serviceSubtitle,
  nameMax,
  subtitleMax,
  updatedLabel,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(serviceName);
  const [subtitle, setSubtitle] = useState(serviceSubtitle);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/email-templates/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_name: name, service_subtitle: subtitle }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ text: data.error || "保存に失敗しました", isError: true });
        return;
      }
      setMessage({ text: "保存しました", isError: false });
      router.refresh();
    } catch {
      setMessage({ text: "エラーが発生しました", isError: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <label htmlFor="email-service-name" className="font-medium">
            サービス名（{nameMax}文字まで）
          </label>
          <Input
            id="email-service-name"
            value={name}
            maxLength={nameMax}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="email-service-subtitle" className="font-medium">
            補足・講座名（{subtitleMax}文字まで。空欄可）
          </label>
          <Input
            id="email-service-subtitle"
            value={subtitle}
            maxLength={subtitleMax}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving || name.trim() === ""}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保存"}
        </Button>
        {message && (
          <span className={`text-xs ${message.isError ? "text-destructive" : "text-green-600"}`}>
            {message.text}
          </span>
        )}
        {updatedLabel && (
          <span className="text-xs text-muted-foreground">最終更新: {updatedLabel}</span>
        )}
      </div>
    </div>
  );
}

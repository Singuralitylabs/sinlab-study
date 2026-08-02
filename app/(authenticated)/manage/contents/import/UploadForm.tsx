"use client";

import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setMessage({ type: "error", text: "CSVファイルを選択してください" });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/manage/contents/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setMessage({ type: "success", text: `${data.createdCount} 件を取り込みました` });
        router.push("/manage/contents");
        router.refresh();
      } else {
        setMessage({ type: "error", text: data.error || "取り込みに失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "取り込み中にエラーが発生しました" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <FileSpreadsheet className="h-5 w-5" />
              <span>CSV形式でコンテンツを一括登録できます</span>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>1行＝1コンテンツ</li>
              <li>テーマ・フェーズ・週名を指定すると自動で階層を作成します</li>
              <li>動画・テキスト・演習の3種に対応します</li>
              <li>取り込みは全件成功時のみ反映され、失敗時はロールバックされます</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csvFile">CSVファイル</Label>
            <Input
              id="csvFile"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")}
            />
            {selectedFileName && (
              <p className="text-sm text-muted-foreground">{selectedFileName}</p>
            )}
          </div>

          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              <AlertDescription className={message.type === "success" ? "text-success" : ""}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isUploading}>
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {isUploading ? "取り込み中..." : "取り込む"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

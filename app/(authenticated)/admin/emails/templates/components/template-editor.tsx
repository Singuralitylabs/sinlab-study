"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { EmailTemplateKey } from "@/app/lib/email-template";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  templateKey: EmailTemplateKey;
  isEdited: boolean;
  initialSubject: string;
  initialBody: string;
  defaultSubject: string;
  defaultBody: string;
  placeholders: { name: string; description: string }[];
  variants: { id: string; label: string }[];
  subjectMax: number;
  bodyMax: number;
  testSendLimit: number;
  serviceName: string;
};

type Preview = { subject: string; text: string; html: string };
type Message = { text: string; isError: boolean };

async function callApi(
  url: string,
  method: string,
  body?: unknown
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "エラーが発生しました" } };
  }
}

export function TemplateEditor(props: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(props.initialSubject);
  const [body, setBody] = useState(props.initialBody);
  const [variant, setVariant] = useState(props.variants[0]?.id ?? "default");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"html" | "text">("html");
  const [busy, setBusy] = useState<"save" | "reset" | "test" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const draft = { template_key: props.templateKey, subject, body, variant };

  const refreshPreview = useCallback(async () => {
    const { ok, data } = await callApi("/api/admin/email-templates/preview", "POST", {
      template_key: props.templateKey,
      subject,
      body,
      variant,
    });
    if (!ok) {
      setPreview(null);
      setPreviewError(String(data.error ?? "プレビューを表示できません"));
      return;
    }
    setPreviewError(null);
    setPreview(data as unknown as Preview);
  }, [props.templateKey, subject, body, variant]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(refreshPreview, 400);
    return () => clearTimeout(timer);
  }, [refreshPreview]);

  const save = async () => {
    setBusy("save");
    setMessage(null);
    const { ok, data } = await callApi("/api/admin/email-templates", "PUT", {
      template_key: props.templateKey,
      subject,
      body,
    });
    setBusy(null);
    if (!ok) {
      setMessage({ text: String(data.error ?? "保存に失敗しました"), isError: true });
      return;
    }
    setMessage({ text: "保存しました", isError: false });
    router.refresh();
  };

  const reset = async () => {
    if (!confirm("編集内容を破棄して、既定の文面に戻しますか？")) {
      return;
    }
    setBusy("reset");
    setMessage(null);
    const { ok, data } = await callApi(
      `/api/admin/email-templates?template_key=${encodeURIComponent(props.templateKey)}`,
      "DELETE"
    );
    setBusy(null);
    if (!ok) {
      setMessage({ text: String(data.error ?? "既定に戻せませんでした"), isError: true });
      return;
    }
    setSubject(props.defaultSubject);
    setBody(props.defaultBody);
    setMessage({ text: "既定の文面に戻しました", isError: false });
    router.refresh();
  };

  const testSend = async () => {
    setBusy("test");
    setMessage(null);
    const { ok, data } = await callApi("/api/admin/email-templates/test-send", "POST", draft);
    setBusy(null);
    setMessage(
      ok
        ? { text: "自分のメールアドレスにテスト送信しました", isError: false }
        : { text: String(data.error ?? "テスト送信に失敗しました"), isError: true }
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1 text-sm">
          <label htmlFor="template-subject" className="font-medium">
            件名（{props.subjectMax}文字まで・改行不可。先頭の【{props.serviceName}
            】は自動で付きます）
          </label>
          <Input
            id="template-subject"
            value={subject}
            maxLength={props.subjectMax}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="template-body" className="font-medium">
            本文（Markdown・{props.bodyMax}文字まで）
          </label>
          <Textarea
            id="template-body"
            value={body}
            maxLength={props.bodyMax}
            rows={16}
            className="font-mono"
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          宛名（「〇〇
          様」）、ボタン、自動送信・返信不可の案内、配信停止リンクは自動で付き、編集できません。
          値が空になるプレースホルダーだけの行は、メールに出ません。
        </p>

        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">使えるプレースホルダー</p>
          <dl className="space-y-1 text-xs">
            {props.placeholders.map((p) => (
              <div key={p.name} className="flex gap-2">
                <dt className="shrink-0 font-mono">{`{{${p.name}}}`}</dt>
                <dd className="text-muted-foreground">{p.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
          </Button>
          <Button variant="outline" onClick={reset} disabled={busy !== null || !props.isEdited}>
            既定に戻す
          </Button>
          <Button variant="outline" onClick={testSend} disabled={busy !== null}>
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : "自分にテスト送信"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          テスト送信はログイン中の自分のメールアドレスにだけ届きます（1日{props.testSendLimit}
          通まで・件名に【テスト】が付きます）。
        </p>
        {message && (
          <p className={`text-sm ${message.isError ? "text-destructive" : "text-green-600"}`}>
            {message.text}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">プレビュー</h2>
          {props.variants.length > 1 && (
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              aria-label="プレビューの条件"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {props.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto flex gap-1">
            {(["html", "text"] as const).map((tab) => (
              <Button
                key={tab}
                size="sm"
                variant={previewTab === tab ? "default" : "outline"}
                onClick={() => setPreviewTab(tab)}
              >
                {tab === "html" ? "HTML版" : "テキスト版"}
              </Button>
            ))}
          </div>
        </div>
        {previewError && <p className="text-sm text-destructive">{previewError}</p>}
        {preview && (
          <>
            <p className="text-sm">
              <span className="text-muted-foreground">件名: </span>
              {preview.subject}
            </p>
            {previewTab === "html" ? (
              // sandbox="" blocks scripts and navigation: the preview is inert.
              <iframe
                title="HTML版プレビュー"
                sandbox=""
                srcDoc={preview.html}
                className="h-[560px] w-full rounded-md border bg-white"
              />
            ) : (
              <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                {preview.text}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

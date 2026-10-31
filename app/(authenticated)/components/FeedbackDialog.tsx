"use client";

import { Loader2, MessageSquarePlus } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/app/constants/feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FeedbackDialogProps = {
  defaultCategory?: FeedbackCategory;
  /** Custom open control (e.g.「問い合わせる」on /upgrade). Defaults to the sidenav entry. */
  trigger?: ReactNode;
};

export function FeedbackDialog({ defaultCategory = "improvement", trigger }: FeedbackDialogProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory);
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          body,
          pageUrl: typeof window !== "undefined" ? window.location.href : pathname,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "送信に失敗しました。時間をおいて再度お試しください。");
        return;
      }
      setSuccess(true);
      setBody("");
      setCategory(defaultCategory);
    } catch {
      setError("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setCategory(defaultCategory);
        } else {
          setError(null);
          setSuccess(false);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-accent w-full text-left"
          >
            <MessageSquarePlus className="h-5 w-5" />
            フィードバック
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {defaultCategory === "plan_inquiry"
              ? "プランについて問い合わせる"
              : "フィードバックを送る"}
          </DialogTitle>
          <DialogDescription>
            {defaultCategory === "plan_inquiry"
              ? "コミュニティ会員への変更など、プランに関するご相談をお送りください。"
              : "不具合・改善要望・質問などをお送りください。ページの情報は自動で付きます。"}
          </DialogDescription>
        </DialogHeader>
        {success ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>送信しました。ご協力ありがとうございます。</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                閉じる
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="feedback-category">種別</Label>
              <select
                id="feedback-category"
                className="border-input bg-transparent flex h-9 w-full rounded-md border px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              >
                {FEEDBACK_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {FEEDBACK_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedback-body">内容</Label>
              <Textarea
                id="feedback-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={FEEDBACK_BODY_MAX_LENGTH}
                required
                className="min-h-[140px]"
                placeholder="できるだけ具体的に書いてください"
              />
              <p className="text-xs text-muted-foreground text-right">
                {body.length}/{FEEDBACK_BODY_MAX_LENGTH}
              </p>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || body.trim().length === 0}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                送信する
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

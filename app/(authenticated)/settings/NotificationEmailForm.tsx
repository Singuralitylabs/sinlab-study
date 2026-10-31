"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { formatDateTimeMinute } from "@/app/lib/format-date";
import { parseNotificationEmail } from "@/app/lib/notification-email";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NotificationEmailFormProps {
  loginEmail: string;
  notificationEmail: string | null;
  pendingEmail: string | null;
  pendingExpiresAt: string | null;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function NotificationEmailForm({
  loginEmail,
  notificationEmail,
  pendingEmail,
  pendingExpiresAt,
}: NotificationEmailFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const destination = notificationEmail ?? loginEmail;
  const pendingActive =
    pendingEmail !== null &&
    pendingExpiresAt !== null &&
    new Date(pendingExpiresAt).getTime() > Date.now();

  const run = async (task: () => Promise<string | null>) => {
    setIsLoading(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const message = await task();
      if (message) {
        setErrorMessage(message);
        return;
      }
      setEmail("");
      router.refresh();
    } catch (error) {
      console.error("通知先の更新エラー:", error);
      setErrorMessage("通知先を更新できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  const requestChange = (nextEmail: string) =>
    run(async () => {
      const parsed = parseNotificationEmail(nextEmail);
      if (!parsed.ok) {
        return parsed.message;
      }
      const response = await fetch("/api/settings/notification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsed.email }),
      });
      if (!response.ok) {
        return readError(
          response,
          "確認メールを送信できませんでした。時間をおいて再度お試しください。"
        );
      }
      setNotice("確認メールを送りました。リンクを開くまで送り先は変わりません。");
      return null;
    });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void requestChange(email);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm">
        <p className="font-medium">ログイン用のアドレス</p>
        <p className="text-muted-foreground">{loginEmail}</p>
        <p className="text-muted-foreground">
          Google アカウントのアドレスです。ログインにはこのアドレスを使います。
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p className="font-medium">現在の送り先</p>
        <p>{destination}</p>
        {notificationEmail && (
          <p className="text-muted-foreground">ログイン用とは別のアドレスに送っています。</p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        お支払いに関するメールは Stripe から登録時のアドレスに届きます。
      </p>

      {pendingEmail && (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">確認待ち</p>
          <p>{pendingEmail}</p>
          {pendingActive && pendingExpiresAt ? (
            <p className="text-muted-foreground">
              有効期限: {formatDateTimeMinute(pendingExpiresAt)}
              。リンクを開くまで送り先は変わりません。
            </p>
          ) : (
            <p className="text-muted-foreground">
              確認リンクの期限が切れています。もう一度送信してください。
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => void requestChange(pendingEmail)}
            >
              再送する
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() =>
                void run(async () => {
                  const response = await fetch("/api/settings/notification-email/cancel", {
                    method: "POST",
                  });
                  if (!response.ok) {
                    return readError(response, "確認待ちを取り消せませんでした。");
                  }
                  setNotice("確認待ちを取り消しました。");
                  return null;
                })
              }
            >
              取り消す
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="notification-email">新しい送り先</Label>
          <Input
            id="notification-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrorMessage(null);
              setNotice(null);
            }}
            disabled={isLoading}
          />
        </div>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          確認メールを送る
        </Button>
      </form>

      {notificationEmail && (
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={() =>
            void run(async () => {
              const response = await fetch("/api/settings/notification-email", {
                method: "DELETE",
              });
              if (!response.ok) {
                return readError(response, "送り先を解除できませんでした。");
              }
              setNotice("送り先をログイン用のアドレスに戻しました。");
              return null;
            })
          }
        >
          ログイン用のアドレスに戻す
        </Button>
      )}

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { installPromptPlatform } from "@/app/constants/pwa";
import { type PushOffer, pushOffer } from "@/app/lib/push-offer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PushStatus = "unsupported" | "denied" | "subscribed" | "unsubscribed";

const STATUS_LABEL: Record<PushStatus, string> = {
  unsupported: "未対応",
  denied: "拒否済み",
  subscribed: "購読中",
  unsubscribed: "未購読",
};

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function canPush(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Home-page notification control. Permission is requested only from the button click.
 * `publicKey` is null when VAPID is incomplete, which hides the whole section.
 */
export function PushNotifications({ publicKey }: { publicKey: string | null }) {
  const [offer, setOffer] = useState<PushOffer | null>(null);
  const [status, setStatus] = useState<PushStatus>("unsubscribed");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setOffer("hidden");
      return;
    }
    const next = pushOffer({
      configured: true,
      // iPadOS 13+ reports Macintosh; pass maxTouchPoints so browser tabs get ios-guide.
      isIos:
        installPromptPlatform(window.navigator.userAgent, window.navigator.maxTouchPoints ?? 0) ===
        "ios",
      standalone: isStandalone(),
    });
    setOffer(next);
    if (next !== "subscribe") {
      return;
    }
    if (!canPush()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    void navigator.serviceWorker
      .getRegistration("/sw.js")
      .then(async (registration) => {
        const existing = await registration?.pushManager.getSubscription();
        setStatus(existing ? "subscribed" : "unsubscribed");
      })
      .catch(() => {
        setStatus("unsubscribed");
      });
  }, [publicKey]);

  if (!publicKey || offer === null || offer === "hidden") {
    return null;
  }

  const enable = async () => {
    if (!canPush()) {
      setStatus("unsupported");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        setMessage("購読を開始できませんでした");
        return;
      }
      const res = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
      if (!res.ok) {
        setMessage("購読の保存に失敗しました");
        return;
      }
      setStatus("subscribed");
    } catch {
      setMessage("通知を有効にできませんでした");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      await subscription?.unsubscribe();
      if (endpoint) {
        const res = await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
        if (!res.ok) {
          setMessage("購読の解除に失敗しました");
          return;
        }
      }
      setStatus("unsubscribed");
    } catch {
      setMessage("通知を停止できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6 space-y-2">
        <h2 className="text-lg font-semibold">通知</h2>
        {offer === "ios-guide" ? (
          <p className="text-sm text-muted-foreground">ホーム画面に追加すると通知を受け取れます</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              学習リマインドとお知らせをブラウザの通知で受け取れます。現在の状態:{" "}
              {STATUS_LABEL[status]}
            </p>
            {status !== "unsupported" && status !== "denied" && (
              <Button
                type="button"
                size="sm"
                variant={status === "subscribed" ? "outline" : "default"}
                onClick={status === "subscribed" ? disable : enable}
                disabled={busy}
              >
                {status === "subscribed" ? "通知を停止する" : "通知を受け取る"}
              </Button>
            )}
            {message && <p className="text-sm text-destructive">{message}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

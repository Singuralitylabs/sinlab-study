"use client";

import { useEffect, useState } from "react";
import {
  INSTALL_PROMPT_DISMISS_KEY,
  installPromptPlatform,
  isMobileUserAgent,
  isStandaloneDisplay,
  shouldShowInstallPrompt,
} from "@/app/constants/pwa";
import {
  type BeforeInstallPromptEvent,
  clearBeforeInstallPromptEvent,
  getBeforeInstallPromptEvent,
  subscribeBeforeInstallPrompt,
} from "@/app/lib/before-install-prompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, "1");
  } catch {
    // Private mode can reject storage. Hiding for this view is enough.
  }
}

/**
 * Mobile browser only. Standalone (already installed) and a stored dismiss hide it.
 * The first render is null so the server HTML does not depend on UA or localStorage.
 */
export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android">("android");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    const maxTouchPoints = navigator.maxTouchPoints ?? 0;
    const isStandalone = isStandaloneDisplay({
      displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
      navigatorStandalone: (
        navigator as Navigator & {
          standalone?: boolean;
        }
      ).standalone,
    });
    setPlatform(installPromptPlatform(userAgent, maxTouchPoints));
    setVisible(
      shouldShowInstallPrompt({
        isStandalone,
        isMobile: isMobileUserAgent(userAgent, maxTouchPoints),
        dismissed: readDismissed(),
      })
    );

    setInstallEvent(getBeforeInstallPromptEvent());
    return subscribeBeforeInstallPrompt(setInstallEvent);
  }, []);

  if (!visible) {
    return null;
  }

  const dismiss = () => {
    rememberDismissed();
    setVisible(false);
  };

  const runInstallPrompt = () => {
    if (!installEvent) {
      return;
    }
    // beforeinstallprompt is one-shot; after dismiss/reject clear it so we show
    // menu steps instead of calling prompt() again on a spent event.
    void (async () => {
      try {
        await installEvent.prompt();
        const { outcome } = await installEvent.userChoice;
        if (outcome === "accepted") {
          clearBeforeInstallPromptEvent();
          dismiss();
          return;
        }
      } catch {
        // Fall through to menu steps; do not permanently hide the banner.
      }
      clearBeforeInstallPromptEvent();
    })();
  };

  return (
    <Card className="mb-6" data-testid="pwa-install-prompt">
      <CardContent className="pt-6 space-y-3">
        <h2 className="text-lg font-semibold">ホーム画面に追加</h2>
        {platform === "ios" ? (
          <p className="text-sm text-muted-foreground">
            共有ボタンを開き、「ホーム画面に追加」を選ぶと、アプリのように開けます。
          </p>
        ) : installEvent ? (
          <p className="text-sm text-muted-foreground">
            ホーム画面に追加すると、アプリのように開けます。
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選ぶと、アプリのように開けます。
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {platform === "android" && installEvent && (
            <Button type="button" className="w-full sm:w-auto" onClick={runInstallPrompt}>
              ホーム画面に追加
            </Button>
          )}
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={dismiss}>
            閉じる
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

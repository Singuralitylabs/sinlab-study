/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "@/app/components/InstallPrompt";
import { INSTALL_PROMPT_DISMISS_KEY } from "@/app/constants/pwa";

describe("InstallPrompt", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const render = async () => {
    await act(async () => {
      root.render(<InstallPrompt />);
    });
  };

  const stubMobile = (userAgent: string, maxTouchPoints = 5) => {
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent,
      maxTouchPoints,
    });
  };

  it("初回描画（SSR）では UA に依存せず何も出さない", () => {
    expect(renderToStaticMarkup(<InstallPrompt />)).toBe("");
  });

  it("Android で beforeinstallprompt が無いときはメニュー手順を出し、閉じると再表示しない", async () => {
    stubMobile("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0");
    await render();
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("ブラウザのメニューから");
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["閉じる"]);

    await act(async () => {
      buttons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY)).toBe("1");
    expect(container.querySelector('[data-testid="pwa-install-prompt"]')).toBeNull();
  });

  it("Android で beforeinstallprompt があるときは追加ボタンを出し、拒否後はメニュー手順へ切り替える", async () => {
    stubMobile("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0");
    await render();
    await act(async () => {
      await Promise.resolve();
    });

    const installEvent = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
      preventDefault: () => void;
    };
    installEvent.prompt = vi.fn(async () => undefined);
    installEvent.userChoice = Promise.resolve({ outcome: "dismissed" });

    await act(async () => {
      window.dispatchEvent(installEvent);
    });

    expect(container.textContent).toContain("ホーム画面に追加すると");
    const addButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "ホーム画面に追加"
    );
    expect(addButton).toBeTruthy();

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(installEvent.prompt).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY)).toBeNull();
    expect(container.querySelector('[data-testid="pwa-install-prompt"]')).not.toBeNull();
    expect(container.textContent).toContain("ブラウザのメニューから");
    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "閉じる",
    ]);
  });

  it("iOS は共有手順を出す", async () => {
    stubMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    await render();
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("共有ボタンを開き");
    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "閉じる",
    ]);
  });
});

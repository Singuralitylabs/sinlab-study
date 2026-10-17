// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsTiles } from "@/app/(authenticated)/settings/SettingsTiles";
import { PRIVACY_URL } from "@/app/constants/legal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("SettingsTiles dialogs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("通知モーダルに送り先・配信・法定表示・プライバシーリンクがある", async () => {
    await act(async () => {
      root.render(
        <SettingsTiles
          displayName="山田"
          profileError={false}
          notification={{
            loginEmail: "login@example.com",
            notificationEmail: "notify@example.com",
            pendingEmail: null,
            pendingExpiresAt: null,
          }}
          notificationError={false}
          emailOptOutAt={null}
          emailOptOutError={false}
          isMailTarget
          membershipType="general"
          userStatus="active"
        />
      );
    });

    const openButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="通知設定を編集"]'
    );
    expect(openButton).not.toBeNull();

    await act(async () => {
      openButton?.click();
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog?.textContent).toContain("login@example.com");
    expect(dialog?.textContent).toContain("notify@example.com");
    expect(dialog?.textContent).toContain("案内メールの配信を停止する");
    expect(dialog?.textContent).toContain("学習状況のお知らせ・リマインド");
    expect(dialog?.textContent).toContain("手続に関する通知");
    expect(dialog?.querySelector(`a[href="${PRIVACY_URL}"]`)).not.toBeNull();
  });

  it("プロフィールモーダルに表示名フォームがある", async () => {
    await act(async () => {
      root.render(
        <SettingsTiles
          displayName="山田"
          profileError={false}
          notification={{
            loginEmail: "login@example.com",
            notificationEmail: null,
            pendingEmail: null,
            pendingExpiresAt: null,
          }}
          notificationError={false}
          emailOptOutAt={null}
          emailOptOutError={false}
          isMailTarget
          membershipType="general"
          userStatus="active"
        />
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="プロフィールを編集"]')
        ?.click();
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog?.querySelector("#display-name")).not.toBeNull();
    expect(dialog?.textContent).toContain("保存する");
  });
});

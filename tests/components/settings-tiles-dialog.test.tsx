// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsTiles } from "@/app/(authenticated)/settings/SettingsTiles";
import { PRIVACY_URL } from "@/app/constants/legal";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
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

const baseProps = {
  displayName: "山田",
  profileError: false,
  notification: {
    loginEmail: "login@example.com",
    notificationEmail: "notify@example.com" as string | null,
    pendingEmail: null as string | null,
    pendingExpiresAt: null as string | null,
  },
  notificationError: false,
  emailOptOutAt: null as string | null,
  emailOptOutError: false,
  isMailTarget: true,
  membershipType: "general" as const,
  userStatus: "active" as const,
};

describe("SettingsTiles dialogs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    replace.mockClear();
    refresh.mockClear();
    window.history.replaceState({}, "", "/settings");
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
      root.render(<SettingsTiles {...baseProps} />);
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
    expect(replace).not.toHaveBeenCalled();
  });

  it("プロフィールモーダルに表示名フォームがある", async () => {
    await act(async () => {
      root.render(
        <SettingsTiles
          {...baseProps}
          notification={{ ...baseProps.notification, notificationEmail: null }}
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

  it("notification_email クエリ付きでモーダルを開くとクエリを外す", async () => {
    window.history.replaceState({}, "", "/settings?notification_email=expired");

    await act(async () => {
      root.render(<SettingsTiles {...baseProps} />);
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="通知設定を編集"]')?.click();
    });

    expect(replace).toHaveBeenCalledWith("/settings");
  });
});

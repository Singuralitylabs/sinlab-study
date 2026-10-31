/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH } from "@/app/constants/user";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { ProfileForm } from "@/app/(authenticated)/settings/ProfileForm";

describe("ProfileForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refresh.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  const render = async (initialDisplayName: string) => {
    await act(async () => {
      root.render(<ProfileForm initialDisplayName={initialDisplayName} />);
    });
  };

  const submit = async () => {
    await act(async () => {
      container.querySelector("form")?.requestSubmit();
    });
  };

  it.each([
    ["空", "", "表示名を入力してください"],
    ["空白のみ", "   ", "表示名を入力してください"],
    [
      "上限超え",
      "あ".repeat(DISPLAY_NAME_MAX_LENGTH + 1),
      `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください`,
    ],
    ["改行", "山田\n太郎", "表示名に改行などの制御文字は使えません"],
    ["タブ", "山\t田", "表示名に改行などの制御文字は使えません"],
  ])("画面は%sを拒否し、API を呼ばない", async (_label, initial, message) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await render(initial);
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(message);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("前後の空白を除いた名前を保存し、画面の表示を取り直す", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: "佐藤 花子" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await render("  佐藤 花子  ");
    await submit();

    expect(fetchMock).toHaveBeenCalledWith("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "佐藤 花子" }),
    });
    expect(container.textContent).toContain("保存しました");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

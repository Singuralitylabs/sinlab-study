/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ReviewListClient } from "@/app/(authenticated)/review-list/ReviewListClient";

const note = (id: number) => ({
  id,
  contentId: 10,
  contentTitle: "記事",
  themeId: 1,
  themeName: "テーマ",
  href: "/learn/1/1/10",
  question: `質問${id}`,
  answer: `回答${id}`,
  createdAt: "2026-11-17T00:00:00Z",
});

describe("復習リストの「シンラビに聞いたこと」", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const buttonByText = (text: string) =>
    [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

  it("続けて2件消しても両方消え、別のタブから戻っても消えたまま。件数も減る", async () => {
    const resolvers: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(() => resolve(new Response("{}", { status: 200 })));
          })
      )
    );
    await act(async () => {
      root.render(
        <ReviewListClient
          unovercome={[]}
          overcome={[]}
          orphanMemos={[]}
          freeMemos={[]}
          savedChatNotes={{ notes: [note(1), note(2), note(3)], loadFailed: false }}
        />
      );
    });
    await act(async () => {
      buttonByText("シンラビに聞いたこと")?.click();
    });
    const deleteButtons = () => [...container.querySelectorAll('button[aria-label="削除"]')];
    await act(async () => {
      (deleteButtons()[0] as HTMLElement).click();
      (deleteButtons()[1] as HTMLElement).click();
    });
    await act(async () => {
      for (const resolve of resolvers) resolve();
    });
    expect(container.textContent).not.toContain("質問1");
    expect(container.textContent).not.toContain("質問2");
    expect(container.textContent).toContain("質問3");
    expect(container.textContent).toContain("シンラビに聞いたこと（1）");

    await act(async () => {
      buttonByText("未克服")?.click();
    });
    await act(async () => {
      buttonByText("シンラビに聞いたこと")?.click();
    });
    expect(container.textContent).not.toContain("質問1");
    expect(container.textContent).toContain("質問3");
  });
});

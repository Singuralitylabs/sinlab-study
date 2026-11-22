/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-image={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { AiChatPanel } from "@/app/components/ai-chat/AiChatPanel";

type Reply = { status: number; body: unknown };

function stubFetch(routes: Record<string, Reply[]>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = `${init?.method ?? "GET"} ${url}`;
    const queue = routes[key] ?? [];
    const reply = queue.length > 1 ? queue.shift() : queue[0];
    if (!reply) {
      throw new Error(`unexpected ${key}`);
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("AiChatPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const render = async (stripeEnabled = true, canSave = true) => {
    await act(async () => {
      root.render(
        <AiChatPanel
          contentId={10}
          contentType="text"
          stripeEnabled={stripeEnabled}
          canSave={canSave}
        />
      );
    });
  };

  const click = async (element: Element | null | undefined) => {
    if (!element) throw new Error("element not found");
    await act(async () => {
      (element as HTMLElement).click();
    });
  };

  const buttonByText = (text: string) =>
    [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

  const typeQuestion = async (text: string) => {
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const submit = async () => {
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true }));
    });
  };

  it("開くまで何も取りに行かず、開くと残り回数を出す", async () => {
    const calls = stubFetch({
      "GET /api/ai-chat/usage": [
        {
          status: 200,
          body: { usage: { remaining: 18, limit: 20, period: "daily", resetsAt: "x" } },
        },
      ],
    });
    await render();
    expect(calls).toHaveLength(0);
    await click(buttonByText("シンラビに相談"));
    expect(container.textContent).toContain("今日はあと 18 回");
    expect(container.textContent).toContain("画面を移ると会話は消えます");
    expect(container.textContent).toContain("シンラビは AI です");
  });

  it("質問して回答を出し、履歴付きで次を送り、復習リストに残せる", async () => {
    const calls = stubFetch({
      "GET /api/ai-chat/usage": [
        {
          status: 200,
          body: { usage: { remaining: 18, limit: 20, period: "daily", resetsAt: "x" } },
        },
      ],
      "POST /api/ai-chat": [
        { status: 200, body: { answer: "最初の回答だよ", remaining: 17, limit: 20 } },
        { status: 200, body: { answer: "次の回答だよ", remaining: 16, limit: 20 } },
      ],
      "POST /api/ai-chat/saved-notes": [{ status: 200, body: { note: { id: 1 } } }],
    });
    await render();
    await click(buttonByText("シンラビに相談"));
    await typeQuestion("質問1");
    await submit();
    expect(container.textContent).toContain("最初の回答だよ");
    expect(container.textContent).toContain("今日はあと 17 回");

    await typeQuestion("質問2");
    await submit();
    const second = calls.filter((c) => c.url === "/api/ai-chat")[1];
    expect(JSON.parse(String(second.init?.body))).toEqual({
      contentId: 10,
      message: "質問2",
      history: [
        { role: "user", content: "質問1" },
        { role: "assistant", content: "最初の回答だよ" },
      ],
    });

    await click(buttonByText("復習リストに残す"));
    const saved = calls.find((c) => c.url === "/api/ai-chat/saved-notes");
    expect(JSON.parse(String(saved?.init?.body))).toEqual({
      contentId: 10,
      question: "質問1",
      answer: "最初の回答だよ",
    });
    expect(container.textContent).toContain("保存しました");
  });

  it("お試しで上限に達したら入力を止め、アップグレードへ誘導する", async () => {
    stubFetch({
      "GET /api/ai-chat/usage": [
        {
          status: 200,
          body: { usage: { remaining: 1, limit: 5, period: "lifetime", resetsAt: null } },
        },
        {
          status: 200,
          body: { usage: { remaining: 0, limit: 5, period: "lifetime", resetsAt: null } },
        },
      ],
      "POST /api/ai-chat": [
        { status: 429, body: { error: "使い切りました", reason: "trial_lifetime" } },
      ],
    });
    await render();
    await click(buttonByText("シンラビに相談"));
    await typeQuestion("質問");
    await submit();
    expect(container.textContent).toContain("使い切りました");
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    expect(container.querySelector('a[href="/upgrade"]')).not.toBeNull();
  });

  it("Stripe が無効なら承認の案内を出す", async () => {
    stubFetch({
      "GET /api/ai-chat/usage": [
        {
          status: 200,
          body: { usage: { remaining: 0, limit: 5, period: "lifetime", resetsAt: null } },
        },
      ],
    });
    await render(false);
    await click(buttonByText("シンラビに相談"));
    expect(container.querySelector('a[href="/upgrade"]')).toBeNull();
    expect(container.textContent).toContain("運営の承認");
  });

  it("admin / maintainer（canSave = false）には「復習リストに残す」を出さない", async () => {
    stubFetch({
      "GET /api/ai-chat/usage": [
        {
          status: 200,
          body: { usage: { remaining: 18, limit: 20, period: "daily", resetsAt: "x" } },
        },
      ],
      "POST /api/ai-chat": [{ status: 200, body: { answer: "回答", remaining: 17, limit: 20 } }],
    });
    await render(true, false);
    await click(buttonByText("シンラビに相談"));
    await typeQuestion("質問");
    await submit();
    expect(container.textContent).toContain("回答");
    expect(buttonByText("復習リストに残す")).toBeUndefined();
    expect(container.textContent).not.toContain("「復習リストに残す」で保存してね");
  });
});

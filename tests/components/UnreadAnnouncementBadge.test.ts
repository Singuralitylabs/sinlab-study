import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/announcements-server", () => ({
  fetchUnreadAnnouncementCount: vi.fn(),
}));

import { UnreadAnnouncementBadge } from "@/app/(authenticated)/components/UnreadAnnouncementBadge";
import { fetchUnreadAnnouncementCount } from "@/app/services/api/announcements-server";

const render = async () => renderToStaticMarkup(await UnreadAnnouncementBadge());

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UnreadAnnouncementBadge", () => {
  it("未読が0件ならバッジを出さない", async () => {
    vi.mocked(fetchUnreadAnnouncementCount).mockResolvedValue(0);
    expect(await render()).toBe("");
  });

  it("未読件数を表示し、スクリーンリーダー向けの文言を付ける", async () => {
    vi.mocked(fetchUnreadAnnouncementCount).mockResolvedValue(3);
    const html = await render();
    expect(html).toContain(">3<");
    expect(html).toContain("未読 3 件");
  });

  it("100件以上は 99+ と表示する", async () => {
    vi.mocked(fetchUnreadAnnouncementCount).mockResolvedValue(100);
    expect(await render()).toContain("99+");
  });
});

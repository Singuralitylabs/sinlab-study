/**
 * @vitest-environment happy-dom
 */
import { LayoutDashboard } from "lucide-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManageGroupNav } from "@/app/(authenticated)/manage/components/ManageGroupNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/manage",
}));

describe("ManageGroupNav", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("ReactNode の icon を描画する（Server→Client 境界向け）", async () => {
    await act(async () => {
      root.render(
        <ManageGroupNav
          items={[
            {
              title: "ダッシュボード",
              href: "/manage",
              icon: <LayoutDashboard className="h-4 w-4" data-testid="nav-icon" />,
            },
          ]}
        />
      );
    });

    expect(container.querySelector('[data-testid="nav-icon"]')).not.toBeNull();
    expect(container.textContent).toContain("ダッシュボード");
  });
});

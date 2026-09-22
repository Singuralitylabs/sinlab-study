import { describe, expect, it } from "vitest";
import { buildGettingStartedItems } from "@/app/(authenticated)/components/GettingStartedChecklist";

describe("buildGettingStartedItems", () => {
  it("progress が null のときは空配列を返す（非 member でダミーを組み立てない）", () => {
    expect(buildGettingStartedItems(0, null, "/learn")).toEqual([]);
  });

  it("定数定義から項目を組み立て、達成と導線を割り当てる", () => {
    const items = buildGettingStartedItems(
      2,
      { hasSubmission: true, hasCompletedReview: false },
      "/learn/1"
    );

    expect(items).toEqual([
      { key: "complete-content", completed: true, href: "/learn/1" },
      { key: "submit-exercise", completed: true, href: "/learn/1" },
      { key: "receive-ai-review", completed: false, href: "/submissions" },
    ]);
  });

  it("テーマが無いときは /learn を導線にする", () => {
    const items = buildGettingStartedItems(
      0,
      { hasSubmission: false, hasCompletedReview: false },
      "/learn"
    );

    expect(items[0]?.href).toBe("/learn");
    expect(items[1]?.href).toBe("/learn");
  });
});

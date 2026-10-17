import { describe, expect, it } from "vitest";
import { currentPlanLabel } from "@/app/(authenticated)/settings/SettingsTiles";

describe("currentPlanLabel", () => {
  it("membership_type があれば会員ラベルを返す", () => {
    expect(currentPlanLabel("general", "active")).toBe("一般有料会員");
    expect(currentPlanLabel("community", "active")).toBe("コミュニティ会員");
  });

  it("trial で membership が無いときはお試しユーザー", () => {
    expect(currentPlanLabel(null, "trial")).toBe("お試しユーザー");
  });

  it("それ以外は未設定", () => {
    expect(currentPlanLabel(null, "active")).toBe("未設定");
    expect(currentPlanLabel(undefined, null)).toBe("未設定");
  });
});

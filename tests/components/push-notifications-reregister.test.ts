import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PushNotifications の既存購読", () => {
  it("マウント時に既存購読があれば POST で再登録する", () => {
    const source = readFileSync("app/components/PushNotifications.tsx", "utf8");
    expect(source).toContain("pushManager.getSubscription()");
    expect(source).toContain('method: "POST"');
    expect(source).toMatch(
      /getSubscription\(\)[\s\S]*method:\s*"POST"[\s\S]*setStatus\("subscribed"\)/
    );
  });
});

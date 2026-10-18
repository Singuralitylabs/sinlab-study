import { describe, expect, it } from "vitest";
import { shouldHideTrialBanner } from "@/app/lib/trial-banner";

describe("shouldHideTrialBanner", () => {
  it.each(["/upgrade", "/learn/1", "/learn/1/", "/learn/1/2", "/learn/1/2/3", "/learn/1/2/3/4"])(
    "%s ではバナーを出さない",
    (pathname) => {
      expect(shouldHideTrialBanner(pathname)).toBe(true);
    }
  );

  it.each([
    "/",
    "/learn",
    "/learn/",
    "/upgrade/success",
    "/upgrades",
    "/learning/1/2",
    "/announcements",
    "/manage/learn/1/2",
  ])("%s ではバナーを出す", (pathname) => {
    expect(shouldHideTrialBanner(pathname)).toBe(false);
  });
});

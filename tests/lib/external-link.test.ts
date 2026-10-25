import { describe, expect, it } from "vitest";
import { isExternalHref } from "@/app/lib/external-link";

describe("isExternalHref", () => {
  it.each(["https://example.com", "http://example.com/a", "HTTPS://EXAMPLE.COM"])(
    "treats %s as external",
    (href) => {
      expect(isExternalHref(href)).toBe(true);
    }
  );

  it.each(["/learn/1", "#section", "mailto:a@example.com", "tel:0312345678", "", undefined])(
    "treats %s as internal",
    (href) => {
      expect(isExternalHref(href)).toBe(false);
    }
  );

  it("treats the app's own origin as internal when appUrl is given", () => {
    expect(isExternalHref("https://app.example.com/learn/1", "https://app.example.com")).toBe(
      false
    );
    expect(isExternalHref("https://other.example.com/", "https://app.example.com")).toBe(true);
  });
});

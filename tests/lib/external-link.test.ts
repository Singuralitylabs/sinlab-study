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
});

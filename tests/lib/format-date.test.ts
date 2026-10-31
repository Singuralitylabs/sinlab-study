import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDatePadded,
  formatDateTime,
  formatDateTimeMinute,
  formatUpdatedWithEditor,
} from "@/app/lib/format-date";

// 2026-10-10T23:00:00Z is 08:00 on 10/11 in JST; a UTC server must still show the JST value.
const ISO = "2026-10-10T23:00:00Z";

describe("format-date (JST fixed)", () => {
  it("formats in Asia/Tokyo regardless of the runtime time zone", () => {
    expect(formatDate(ISO)).toBe("2026/10/11");
    expect(formatDatePadded("2026-10-04T15:30:00Z")).toBe("2026/10/05");
    expect(formatDateTime(ISO)).toBe("2026/10/11 8:00:00");
    expect(formatDateTimeMinute(ISO)).toBe("2026/10/11 08:00");
  });

  it("formatUpdatedWithEditor resolves the editor label", () => {
    expect(formatUpdatedWithEditor(ISO, 1, { 1: "管理者" })).toBe("2026/10/11 8:00:00（管理者）");
    expect(formatUpdatedWithEditor(ISO, 2, {})).toBe("2026/10/11 8:00:00（不明）");
    expect(formatUpdatedWithEditor(ISO, null, {}, "初期値")).toBe("2026/10/11 8:00:00（初期値）");
  });
});

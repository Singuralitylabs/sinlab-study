import { describe, expect, it } from "vitest";
import {
  cancellationEndsAt,
  isCancellationScheduled,
  subscriptionPeriodLabel,
} from "@/app/lib/subscription-period";

// 2026-10-26T15:00:00Z は JST で 2026/10/27
const PERIOD_END = "2026-10-26T15:00:00.000Z";
const CANCEL_AT = "2026-10-19T15:00:00.000Z";

const fields = (overrides: Partial<Parameters<typeof cancellationEndsAt>[0]> = {}) => ({
  cancel_at_period_end: false,
  cancel_at: null,
  current_period_end: PERIOD_END,
  ...overrides,
});

describe("isCancellationScheduled", () => {
  it.each([
    ["解約予約なし", fields(), false],
    [
      "classic billing mode の期間末解約（cancel_at_period_end）",
      fields({ cancel_at_period_end: true }),
      true,
    ],
    [
      "flexible billing mode の Portal 解約（cancel_at のみ）",
      fields({ cancel_at: CANCEL_AT }),
      true,
    ],
  ])("%s", (_label, input, expected) => {
    expect(isCancellationScheduled(input)).toBe(expected);
  });
});

describe("cancellationEndsAt", () => {
  it("cancel_at を優先し、無ければ current_period_end を返す", () => {
    expect(cancellationEndsAt(fields({ cancel_at: CANCEL_AT }))).toBe(CANCEL_AT);
    expect(cancellationEndsAt(fields({ cancel_at_period_end: true }))).toBe(PERIOD_END);
    expect(cancellationEndsAt(fields({ current_period_end: null }))).toBeNull();
  });
});

describe("subscriptionPeriodLabel", () => {
  it("解約予約が無ければ次回のお支払い日（JST）を示す", () => {
    expect(subscriptionPeriodLabel(fields())).toBe("次回のお支払い: 2026/10/27");
  });

  it("cancel_at_period_end の解約予約は、期間末を利用期限として示す", () => {
    expect(subscriptionPeriodLabel(fields({ cancel_at_period_end: true }))).toBe(
      "2026/10/27をもって解約予定です"
    );
  });

  it("cancel_at だけが設定された解約予約（flexible billing mode）も、cancel_at の日付で示す", () => {
    expect(subscriptionPeriodLabel(fields({ cancel_at: CANCEL_AT }))).toBe(
      "2026/10/20をもって解約予定です"
    );
  });

  it("日付が無ければ文言を添えない", () => {
    expect(subscriptionPeriodLabel(fields({ current_period_end: null }))).toBeNull();
    expect(
      subscriptionPeriodLabel(fields({ cancel_at_period_end: true, current_period_end: null }))
    ).toBeNull();
  });
});

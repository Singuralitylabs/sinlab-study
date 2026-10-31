import { describe, expect, it } from "vitest";
import { readArgs } from "@/scripts/grading-dry-run";

describe("grading-dry-run readArgs", () => {
  it("--model で比較対象のモデルを固定する", () => {
    expect(readArgs(["--confirm-dev", "--model", "gemini-3.6-flash", "--limit", "2"])).toEqual({
      contentIds: [],
      limit: 2,
      repeat: 1,
      confirmed: true,
      model: "gemini-3.6-flash",
    });
  });

  it("--model の値が無いときは失敗する", () => {
    expect(() => readArgs(["--model"])).toThrow(/--model requires a model id/);
  });

  it("未指定のときはモデルを固定しない", () => {
    expect(readArgs(["--confirm-dev"]).model).toBeUndefined();
  });
});

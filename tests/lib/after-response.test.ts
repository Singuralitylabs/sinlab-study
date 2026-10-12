import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));

import { after } from "next/server";
import { runAfterResponse } from "@/app/lib/after-response";

beforeEach(() => {
  vi.mocked(after).mockReset();
});

describe("runAfterResponse", () => {
  it("after() が使えるときはレスポンス後に回し、その場では実行しない", async () => {
    const task = vi.fn().mockResolvedValue(undefined);

    await runAfterResponse(task);

    expect(after).toHaveBeenCalledWith(task);
    expect(task).not.toHaveBeenCalled();
  });

  it("after() がスコープ外で throw するときは、その場で実行して完了を待つ", async () => {
    vi.mocked(after).mockImplementation(() => {
      throw new Error("outside request scope");
    });
    let finished = false;
    const task = vi.fn(async () => {
      await Promise.resolve();
      finished = true;
    });

    await runAfterResponse(task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(finished).toBe(true);
  });
});

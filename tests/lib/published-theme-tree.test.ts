import { describe, expect, it } from "vitest";
import { orderContentsAcrossThemes } from "@/app/lib/published-theme-tree";

describe("orderContentsAcrossThemes", () => {
  it("テーマ display_order のあと buildThemeContentOrder と同じ学習順にする", () => {
    const ordered = orderContentsAcrossThemes([
      {
        id: 2,
        name: "後のテーマ",
        display_order: 2,
        phases: [
          {
            id: 20,
            name: "P",
            display_order: 1,
            contents: [{ id: 2000, title: "C2", display_order: 1, phase_id: 20 }],
          },
        ],
      },
      {
        id: 1,
        name: "先のテーマ",
        display_order: 1,
        phases: [
          {
            id: 10,
            name: "P",
            display_order: 1,
            contents: [
              { id: 1001, title: "C1b", display_order: 2, phase_id: 10 },
              { id: 1000, title: "C1a", display_order: 1, phase_id: 10 },
            ],
          },
        ],
      },
    ]);

    expect(ordered.map((row) => row.content.id)).toEqual([1000, 1001, 2000]);
    expect(ordered.map((row) => row.themeId)).toEqual([1, 1, 2]);
  });
});

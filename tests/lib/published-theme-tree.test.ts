import { describe, expect, it } from "vitest";
import {
  applyMainCourseNestedThemeFilters,
  applyPublishedNestedThemeFilters,
  orderContentsAcrossThemes,
} from "@/app/lib/published-theme-tree";

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

function recordEqCalls() {
  const calls: [string, boolean][] = [];
  const builder = {
    eq(column: string, value: boolean) {
      calls.push([column, value]);
      return builder;
    },
  };
  return { builder, calls };
}

describe("applyMainCourseNestedThemeFilters (#556)", () => {
  it("公開ツリーの絞り込みに、付録フェーズを外す条件を足す", () => {
    const published = recordEqCalls();
    applyPublishedNestedThemeFilters(published.builder);
    const main = recordEqCalls();
    applyMainCourseNestedThemeFilters(main.builder);

    expect(main.calls).toEqual([...published.calls, ["phases.is_appendix", false]]);
  });
});

describe("orderContentsAcrossThemes の付録 (#556)", () => {
  it("付録のフェーズはテーマ内で本編の後ろに並ぶ（復習リストの並び）", () => {
    const ordered = orderContentsAcrossThemes([
      {
        id: 1,
        name: "T",
        display_order: 1,
        phases: [
          {
            id: 10,
            name: "付録",
            display_order: 1,
            is_appendix: true,
            contents: [{ id: 100, title: "A", display_order: 1, phase_id: 10 }],
          },
          {
            id: 11,
            name: "本編",
            display_order: 2,
            is_appendix: false,
            contents: [{ id: 110, title: "M", display_order: 1, phase_id: 11 }],
          },
        ],
      },
    ]);

    expect(ordered.map((row) => row.content.id)).toEqual([110, 100]);
  });
});

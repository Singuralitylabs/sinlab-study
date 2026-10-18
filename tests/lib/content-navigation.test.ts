import { describe, expect, it } from "vitest";
import {
  buildThemeContentOrder,
  type NavigationContentInput,
  type NavigationPhase,
  resolveAdjacentContents,
  resolveContentNavigation,
} from "@/app/lib/content-navigation";

function makePhase(id: number, displayOrder: number | null, name?: string): NavigationPhase {
  return {
    id,
    name: name ?? `フェーズ${id}`,
    display_order: displayOrder,
  };
}

function makeContent(
  overrides: Partial<NavigationContentInput> & { id: number; phase_id: number }
): NavigationContentInput {
  return {
    id: overrides.id,
    title: overrides.title ?? `コンテンツ${overrides.id}`,
    phase_id: overrides.phase_id,
    display_order: overrides.display_order === undefined ? 0 : overrides.display_order,
  };
}

describe("buildThemeContentOrder", () => {
  it("フェーズ→コンテンツの display_order 昇順に並ぶ", () => {
    const phases = [makePhase(2, 2), makePhase(1, 1)];
    const contents = [
      makeContent({ id: 3, phase_id: 1, display_order: 2 }),
      makeContent({ id: 1, phase_id: 2, display_order: 1 }),
      makeContent({ id: 2, phase_id: 1, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(phases, contents).map((c) => c.id)).toEqual([2, 3, 1]);
  });

  it("display_order 同値のフェーズ同士 / コンテンツ同士が id でタイブレークされる", () => {
    const phases = [makePhase(20, 1), makePhase(10, 1)];
    const contents = [
      makeContent({ id: 40, phase_id: 20, display_order: 1 }),
      makeContent({ id: 31, phase_id: 20, display_order: 1 }),
      makeContent({ id: 30, phase_id: 20, display_order: 1 }),
      makeContent({ id: 10, phase_id: 10, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(phases, contents).map((c) => c.id)).toEqual([10, 30, 31, 40]);
  });

  it("display_order が null の要素が各階層の末尾に寄る", () => {
    const phases = [makePhase(2, null), makePhase(1, 1)];
    const contents = [
      makeContent({ id: 12, phase_id: 1, display_order: null }),
      makeContent({ id: 11, phase_id: 1, display_order: 1 }),
      makeContent({ id: 21, phase_id: 2, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(phases, contents).map((c) => c.id)).toEqual([11, 12, 21]);
  });

  it("コンテンツ0件のフェーズを挟んでも、前後のフェーズのコンテンツが隣接する", () => {
    const phases = [makePhase(1, 1), makePhase(2, 2), makePhase(3, 3)];
    const contents = [
      makeContent({ id: 1, phase_id: 1, display_order: 1 }),
      makeContent({ id: 3, phase_id: 3, display_order: 1 }),
    ];

    const ordered = buildThemeContentOrder(phases, contents);
    expect(ordered.map((c) => c.id)).toEqual([1, 3]);

    const { next } = resolveAdjacentContents(ordered, 1);
    expect(next?.id).toBe(3);
    expect(next?.boundary).toBe("phase");
  });

  it("フェーズリストに存在しない phase_id のコンテンツは通し列に含まれない", () => {
    const phases = [makePhase(1, 1)];
    const contents = [
      makeContent({ id: 1, phase_id: 1, display_order: 1 }),
      makeContent({ id: 99, phase_id: 99, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(phases, contents).map((c) => c.id)).toEqual([1]);
  });
});

describe("resolveAdjacentContents", () => {
  const phases = [makePhase(1, 1, "導入"), makePhase(2, 2, "応用")];
  const contents = [
    makeContent({ id: 11, title: "A", phase_id: 1, display_order: 1 }),
    makeContent({ id: 12, title: "B", phase_id: 1, display_order: 2 }),
    makeContent({ id: 13, title: "C", phase_id: 1, display_order: 3 }),
    makeContent({ id: 21, title: "D", phase_id: 2, display_order: 1 }),
  ];
  const ordered = buildThemeContentOrder(phases, contents);

  it("フェーズの途中: prev/next とも same-phase", () => {
    const { prev, next } = resolveAdjacentContents(ordered, 12);
    expect(prev?.id).toBe(11);
    expect(prev?.boundary).toBe("same-phase");
    expect(next?.id).toBe(13);
    expect(next?.boundary).toBe("same-phase");
  });

  it("フェーズ末尾: next が次フェーズの先頭で phase、フェーズ先頭: prev が phase", () => {
    const atPhaseEnd = resolveAdjacentContents(ordered, 13);
    expect(atPhaseEnd.next?.id).toBe(21);
    expect(atPhaseEnd.next?.boundary).toBe("phase");
    expect(atPhaseEnd.next?.phaseName).toBe("応用");

    const atPhaseStart = resolveAdjacentContents(ordered, 21);
    expect(atPhaseStart.prev?.id).toBe(13);
    expect(atPhaseStart.prev?.boundary).toBe("phase");
    expect(atPhaseStart.prev?.phaseName).toBe("導入");
  });

  it("テーマ先頭で prev === null、テーマ末尾で next === null", () => {
    expect(resolveAdjacentContents(ordered, 11).prev).toBeNull();
    expect(resolveAdjacentContents(ordered, 21).next).toBeNull();
  });

  it("コンテンツ1件だけのフェーズを挟むと prev/next とも phase", () => {
    const singlePhases = [makePhase(1, 1), makePhase(2, 2), makePhase(3, 3)];
    const singleContents = [
      makeContent({ id: 1, phase_id: 1, display_order: 1 }),
      makeContent({ id: 2, phase_id: 2, display_order: 1 }),
      makeContent({ id: 3, phase_id: 3, display_order: 1 }),
    ];
    const singleOrdered = buildThemeContentOrder(singlePhases, singleContents);

    const { prev, next } = resolveAdjacentContents(singleOrdered, 2);
    expect(prev?.id).toBe(1);
    expect(prev?.boundary).toBe("phase");
    expect(next?.id).toBe(3);
    expect(next?.boundary).toBe("phase");
  });

  it("currentContentId が列に無い / 通し列が空 → { prev: null, next: null }", () => {
    expect(resolveAdjacentContents(ordered, 999)).toEqual({ prev: null, next: null });
    expect(resolveAdjacentContents([], 11)).toEqual({ prev: null, next: null });
  });
});

describe("resolveContentNavigation", () => {
  const phases = [makePhase(1, 1, "導入"), makePhase(2, 2, "応用")];
  const contents = [
    makeContent({ id: 11, title: "A", phase_id: 1, display_order: 1 }),
    makeContent({ id: 12, title: "B", phase_id: 1, display_order: 2 }),
    makeContent({ id: 21, title: "C", phase_id: 2, display_order: 1 }),
  ];
  const ordered = buildThemeContentOrder(phases, contents);

  it("通し列に現在があるテーマ末尾は endFallback が theme", () => {
    const result = resolveContentNavigation(ordered, 21, []);
    expect(result.next).toBeNull();
    expect(result.prev?.id).toBe(12);
    expect(result.endFallback).toBe("theme");
  });

  it("通し列が空の縮退時はフェーズローカルの前後を使い、endFallback が phase", () => {
    const phaseLocal = buildThemeContentOrder(
      [makePhase(1, 1, "導入")],
      [
        makeContent({ id: 11, title: "A", phase_id: 1, display_order: 1 }),
        makeContent({ id: 12, title: "B", phase_id: 1, display_order: 2 }),
      ]
    );

    const result = resolveContentNavigation([], 11, phaseLocal);
    expect(result.prev).toBeNull();
    expect(result.next?.id).toBe(12);
    expect(result.next?.boundary).toBe("same-phase");
    expect(result.endFallback).toBe("phase");
  });

  it("通し列に現在が無い縮退時も endFallback が phase", () => {
    const result = resolveContentNavigation(ordered, 999, []);
    expect(result).toEqual({ prev: null, next: null, endFallback: "phase" });
  });
});

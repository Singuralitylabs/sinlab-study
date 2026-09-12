import { describe, expect, it } from "vitest";
import {
  buildThemeContentOrder,
  type NavigationContentInput,
  type NavigationWeek,
  resolveAdjacentContents,
} from "@/app/lib/content-navigation";

function makeWeek(
  overrides: Partial<NavigationWeek> & {
    id: number;
    name?: string;
    phase: NavigationWeek["phase"];
  }
): NavigationWeek {
  return {
    id: overrides.id,
    name: overrides.name ?? `週${overrides.id}`,
    display_order: overrides.display_order ?? 0,
    phase: overrides.phase,
  };
}

function makePhase(id: number, displayOrder: number | null, name?: string) {
  return {
    id,
    name: name ?? `フェーズ${id}`,
    display_order: displayOrder,
  };
}

function makeContent(
  overrides: Partial<NavigationContentInput> & { id: number; week_id: number }
): NavigationContentInput {
  return {
    id: overrides.id,
    title: overrides.title ?? `コンテンツ${overrides.id}`,
    week_id: overrides.week_id,
    display_order: overrides.display_order ?? 0,
  };
}

describe("buildThemeContentOrder", () => {
  it("フェーズ→週→コンテンツの display_order 昇順に並ぶ", () => {
    const phase2 = makePhase(2, 2);
    const phase1 = makePhase(1, 1);
    const weeks = [
      makeWeek({ id: 20, display_order: 2, phase: phase1 }),
      makeWeek({ id: 10, display_order: 1, phase: phase1 }),
      makeWeek({ id: 30, display_order: 1, phase: phase2 }),
    ];
    const contents = [
      makeContent({ id: 3, week_id: 10, display_order: 2 }),
      makeContent({ id: 1, week_id: 30, display_order: 1 }),
      makeContent({ id: 2, week_id: 10, display_order: 1 }),
      makeContent({ id: 4, week_id: 20, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(weeks, contents).map((c) => c.id)).toEqual([2, 3, 4, 1]);
  });

  it("display_order 同値のフェーズ同士 / 週同士 / コンテンツ同士が id でタイブレークされる", () => {
    const phaseB = makePhase(20, 1);
    const phaseA = makePhase(10, 1);
    const weeks = [
      makeWeek({ id: 4, display_order: 1, phase: phaseB }),
      makeWeek({ id: 3, display_order: 1, phase: phaseB }),
      makeWeek({ id: 2, display_order: 1, phase: phaseA }),
      makeWeek({ id: 1, display_order: 1, phase: phaseA }),
    ];
    const contents = [
      makeContent({ id: 40, week_id: 4, display_order: 1 }),
      makeContent({ id: 31, week_id: 3, display_order: 1 }),
      makeContent({ id: 30, week_id: 3, display_order: 1 }),
      makeContent({ id: 20, week_id: 2, display_order: 1 }),
      makeContent({ id: 10, week_id: 1, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(weeks, contents).map((c) => c.id)).toEqual([10, 20, 30, 31, 40]);
  });

  it("display_order が null の要素が各階層の末尾に寄る", () => {
    const phaseOrdered = makePhase(1, 1);
    const phaseNull = makePhase(2, null);
    const weeks = [
      makeWeek({ id: 2, display_order: null, phase: phaseOrdered }),
      makeWeek({ id: 1, display_order: 1, phase: phaseOrdered }),
      makeWeek({ id: 3, display_order: 1, phase: phaseNull }),
    ];
    const contents = [
      makeContent({ id: 12, week_id: 1, display_order: null }),
      makeContent({ id: 11, week_id: 1, display_order: 1 }),
      makeContent({ id: 21, week_id: 2, display_order: 1 }),
      makeContent({ id: 31, week_id: 3, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(weeks, contents).map((c) => c.id)).toEqual([11, 12, 21, 31]);
  });

  it("コンテンツ0件の週を挟んでも、その前後の週のコンテンツが隣接する", () => {
    const phase = makePhase(1, 1);
    const weeks = [
      makeWeek({ id: 1, display_order: 1, phase }),
      makeWeek({ id: 2, display_order: 2, phase }),
      makeWeek({ id: 3, display_order: 3, phase }),
    ];
    const contents = [
      makeContent({ id: 1, week_id: 1, display_order: 1 }),
      makeContent({ id: 3, week_id: 3, display_order: 1 }),
    ];

    const ordered = buildThemeContentOrder(weeks, contents);
    expect(ordered.map((c) => c.id)).toEqual([1, 3]);

    const { next } = resolveAdjacentContents(ordered, 1);
    expect(next?.id).toBe(3);
    expect(next?.boundary).toBe("week");
  });

  it("コンテンツ0件のフェーズ（週はあるが全て空）を挟んでも、前後のフェーズが隣接する", () => {
    const phase1 = makePhase(1, 1);
    const phase2 = makePhase(2, 2);
    const phase3 = makePhase(3, 3);
    const weeks = [
      makeWeek({ id: 1, display_order: 1, phase: phase1 }),
      makeWeek({ id: 2, display_order: 1, phase: phase2 }),
      makeWeek({ id: 3, display_order: 1, phase: phase3 }),
    ];
    const contents = [
      makeContent({ id: 1, week_id: 1, display_order: 1 }),
      makeContent({ id: 3, week_id: 3, display_order: 1 }),
    ];

    const ordered = buildThemeContentOrder(weeks, contents);
    expect(ordered.map((c) => c.id)).toEqual([1, 3]);

    const { next } = resolveAdjacentContents(ordered, 1);
    expect(next?.id).toBe(3);
    expect(next?.boundary).toBe("phase");
  });

  it("コンテンツ0件のフェーズ（週が0件）を挟んでも、前後のフェーズが隣接する", () => {
    const phase1 = makePhase(1, 1);
    const phase3 = makePhase(3, 3);
    const weeks = [
      makeWeek({ id: 1, display_order: 1, phase: phase1 }),
      makeWeek({ id: 3, display_order: 1, phase: phase3 }),
    ];
    const contents = [
      makeContent({ id: 1, week_id: 1, display_order: 1 }),
      makeContent({ id: 3, week_id: 3, display_order: 1 }),
    ];

    const ordered = buildThemeContentOrder(weeks, contents);
    const { next } = resolveAdjacentContents(ordered, 1);
    expect(next?.id).toBe(3);
    expect(next?.boundary).toBe("phase");
  });

  it("週リストに存在しない week_id のコンテンツは通し列に含まれない", () => {
    const phase = makePhase(1, 1);
    const weeks = [makeWeek({ id: 1, display_order: 1, phase })];
    const contents = [
      makeContent({ id: 1, week_id: 1, display_order: 1 }),
      makeContent({ id: 99, week_id: 99, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(weeks, contents).map((c) => c.id)).toEqual([1]);
  });

  it("phase が null の週は除外される", () => {
    const phase = makePhase(1, 1);
    const weeks = [
      makeWeek({ id: 1, display_order: 1, phase }),
      makeWeek({ id: 2, display_order: 2, phase: null }),
    ];
    const contents = [
      makeContent({ id: 1, week_id: 1, display_order: 1 }),
      makeContent({ id: 2, week_id: 2, display_order: 1 }),
    ];

    expect(buildThemeContentOrder(weeks, contents).map((c) => c.id)).toEqual([1]);
  });
});

describe("resolveAdjacentContents", () => {
  const phase1 = makePhase(1, 1, "導入");
  const phase2 = makePhase(2, 2, "応用");
  const weeks = [
    makeWeek({ id: 1, name: "第1週", display_order: 1, phase: phase1 }),
    makeWeek({ id: 2, name: "第2週", display_order: 2, phase: phase1 }),
    makeWeek({ id: 3, name: "第3週", display_order: 1, phase: phase2 }),
  ];
  const contents = [
    makeContent({ id: 11, title: "A", week_id: 1, display_order: 1 }),
    makeContent({ id: 12, title: "B", week_id: 1, display_order: 2 }),
    makeContent({ id: 13, title: "C", week_id: 1, display_order: 3 }),
    makeContent({ id: 21, title: "D", week_id: 2, display_order: 1 }),
    makeContent({ id: 31, title: "E", week_id: 3, display_order: 1 }),
  ];
  const ordered = buildThemeContentOrder(weeks, contents);

  it("週の途中: prev/next とも same-week", () => {
    const { prev, next } = resolveAdjacentContents(ordered, 12);
    expect(prev?.id).toBe(11);
    expect(prev?.boundary).toBe("same-week");
    expect(next?.id).toBe(13);
    expect(next?.boundary).toBe("same-week");
  });

  it("週末尾: next が次の週の先頭で week、週先頭: prev が前の週の末尾で week", () => {
    const atWeekEnd = resolveAdjacentContents(ordered, 13);
    expect(atWeekEnd.next?.id).toBe(21);
    expect(atWeekEnd.next?.boundary).toBe("week");
    expect(atWeekEnd.next?.weekName).toBe("第2週");

    const atWeekStart = resolveAdjacentContents(ordered, 21);
    expect(atWeekStart.prev?.id).toBe(13);
    expect(atWeekStart.prev?.boundary).toBe("week");
    expect(atWeekStart.prev?.weekName).toBe("第1週");
  });

  it("フェーズ末尾: next が次フェーズの先頭で phase、フェーズ先頭: prev が phase", () => {
    const atPhaseEnd = resolveAdjacentContents(ordered, 21);
    expect(atPhaseEnd.next?.id).toBe(31);
    expect(atPhaseEnd.next?.boundary).toBe("phase");
    expect(atPhaseEnd.next?.phaseName).toBe("応用");

    const atPhaseStart = resolveAdjacentContents(ordered, 31);
    expect(atPhaseStart.prev?.id).toBe(21);
    expect(atPhaseStart.prev?.boundary).toBe("phase");
    expect(atPhaseStart.prev?.phaseName).toBe("導入");
  });

  it("テーマ先頭で prev === null、テーマ末尾で next === null", () => {
    expect(resolveAdjacentContents(ordered, 11).prev).toBeNull();
    expect(resolveAdjacentContents(ordered, 31).next).toBeNull();
  });

  it("コンテンツ1件だけの週を挟むと prev/next とも week", () => {
    const singlePhase = makePhase(1, 1);
    const singleWeeks = [
      makeWeek({ id: 1, display_order: 1, phase: singlePhase }),
      makeWeek({ id: 2, display_order: 2, phase: singlePhase }),
      makeWeek({ id: 3, display_order: 3, phase: singlePhase }),
    ];
    const singleContents = [
      makeContent({ id: 1, week_id: 1, display_order: 1 }),
      makeContent({ id: 2, week_id: 2, display_order: 1 }),
      makeContent({ id: 3, week_id: 3, display_order: 1 }),
    ];
    const singleOrdered = buildThemeContentOrder(singleWeeks, singleContents);

    const { prev, next } = resolveAdjacentContents(singleOrdered, 2);
    expect(prev?.id).toBe(1);
    expect(prev?.boundary).toBe("week");
    expect(next?.id).toBe(3);
    expect(next?.boundary).toBe("week");
  });

  it("currentContentId が列に無い / 通し列が空 → { prev: null, next: null }", () => {
    expect(resolveAdjacentContents(ordered, 999)).toEqual({ prev: null, next: null });
    expect(resolveAdjacentContents([], 11)).toEqual({ prev: null, next: null });
  });
});

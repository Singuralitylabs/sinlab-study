import { describe, expect, it } from "vitest";
import { type NavigablePhase, resolveAdjacentPhases } from "@/app/lib/phase-navigation";

function makePhase(id: number, displayOrder: number | null, name?: string): NavigablePhase {
  return {
    id,
    name: name ?? `フェーズ${id}`,
    display_order: displayOrder,
  };
}

describe("resolveAdjacentPhases", () => {
  it("display_order 昇順の前後を返す", () => {
    const phases = [makePhase(3, 3, "C"), makePhase(1, 1, "A"), makePhase(2, 2, "B")];

    expect(resolveAdjacentPhases(phases, 2)).toEqual({
      prev: makePhase(1, 1, "A"),
      next: makePhase(3, 3, "C"),
    });
  });

  it("先頭では prev が null、末尾では next が null", () => {
    const phases = [makePhase(1, 1), makePhase(2, 2)];

    expect(resolveAdjacentPhases(phases, 1).prev).toBeNull();
    expect(resolveAdjacentPhases(phases, 1).next?.id).toBe(2);
    expect(resolveAdjacentPhases(phases, 2).next).toBeNull();
    expect(resolveAdjacentPhases(phases, 2).prev?.id).toBe(1);
  });

  it("1件だけなら前後とも null", () => {
    expect(resolveAdjacentPhases([makePhase(9, 1)], 9)).toEqual({
      prev: null,
      next: null,
    });
  });

  it("一覧に無い id では前後とも null（偽の導線を出さない）", () => {
    expect(resolveAdjacentPhases([makePhase(1, 1)], 99)).toEqual({
      prev: null,
      next: null,
    });
  });

  it("display_order 同値は id でタイブレークする", () => {
    const phases = [makePhase(20, 1, "B"), makePhase(10, 1, "A")];

    expect(resolveAdjacentPhases(phases, 10)).toEqual({
      prev: null,
      next: makePhase(20, 1, "B"),
    });
  });
});

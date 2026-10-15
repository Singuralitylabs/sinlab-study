import { compareGroupLevel } from "@/app/lib/content-grouping";
import {
  buildThemeContentOrder,
  type NavigationContent,
  type NavigationWeek,
} from "@/app/lib/content-navigation";

/** Content row shape required to assemble learning order (extra columns are preserved on `raw`). */
export type NestedThemeContentRow = {
  id: number;
  title: string;
  display_order: number | null;
  week_id: number;
};

export type NestedThemeTree<TContent extends NestedThemeContentRow = NestedThemeContentRow> = {
  id: number;
  name: string;
  display_order: number | null;
  phases: {
    id: number;
    name: string;
    display_order: number | null;
    weeks: {
      id: number;
      name: string;
      display_order: number | null;
      contents: TContent[];
    }[];
  }[];
};

export type OrderedThemeContent<TContent extends NestedThemeContentRow> = {
  themeId: number;
  themeName: string;
  content: NavigationContent;
  raw: TContent;
};

/**
 * Sort themes by display_order then walk each with buildThemeContentOrder(). Shared by home,
 * review-list, and digest so published-tree → learning-order assembly cannot drift apart.
 */
export function orderContentsAcrossThemes<TContent extends NestedThemeContentRow>(
  themes: readonly NestedThemeTree<TContent>[]
): OrderedThemeContent<TContent>[] {
  const orderedThemes = [...themes].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  const result: OrderedThemeContent<TContent>[] = [];
  for (const theme of orderedThemes) {
    const weeks: NavigationWeek[] = theme.phases.flatMap((phase) =>
      phase.weeks.map((week) => ({
        id: week.id,
        name: week.name,
        display_order: week.display_order,
        phase: {
          id: phase.id,
          name: phase.name,
          display_order: phase.display_order,
        },
      }))
    );
    const contents = theme.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.contents));
    const contentById = new Map(contents.map((c) => [c.id, c]));
    for (const ordered of buildThemeContentOrder(weeks, contents)) {
      const raw = contentById.get(ordered.id);
      if (!raw) continue;
      result.push({
        themeId: theme.id,
        themeName: theme.name,
        content: ordered,
        raw,
      });
    }
  }
  return result;
}

/**
 * All-levels is_published / is_deleted filters for nested theme→phase→week→content selects.
 * Omitting a level here while another caller keeps it leaves counts / lists / digests mismatched.
 * Cast through a shallow eq-chain so PostgREST builder generics do not explode (TS2589).
 */
export function applyPublishedNestedThemeFilters<Q>(query: Q): Q {
  type EqChain = { eq: (column: string, value: boolean) => EqChain };
  const chained = query as unknown as EqChain;
  return chained
    .eq("is_published", true)
    .eq("is_deleted", false)
    .eq("phases.is_published", true)
    .eq("phases.is_deleted", false)
    .eq("phases.weeks.is_published", true)
    .eq("phases.weeks.is_deleted", false)
    .eq("phases.weeks.contents.is_published", true)
    .eq("phases.weeks.contents.is_deleted", false) as unknown as Q;
}

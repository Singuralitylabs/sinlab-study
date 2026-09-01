"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  PhaseFilterOption,
  ThemeFilterOption,
  WeekFilterOption,
} from "@/app/lib/content-filtering";
import type { ContentType } from "@/app/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONTENT_TYPE_FILTER_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "video", label: "動画" },
  { value: "text", label: "テキスト" },
  { value: "exercise", label: "演習" },
  { value: "slide", label: "スライド" },
];

const SELECT_CLASS_NAME =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

interface ContentsFilterValues {
  theme: string;
  phase: string;
  week: string;
  type: string;
  q: string;
}

interface ContentsFilterBarProps {
  themes: ThemeFilterOption[];
  phases: PhaseFilterOption[];
  weeks: WeekFilterOption[];
  initialFilters: ContentsFilterValues;
}

export function ContentsFilterBar({
  themes,
  phases,
  weeks,
  initialFilters,
}: ContentsFilterBarProps) {
  const router = useRouter();
  const [theme, setTheme] = useState(initialFilters.theme);
  const [phase, setPhase] = useState(initialFilters.phase);
  const [week, setWeek] = useState(initialFilters.week);
  const [type, setType] = useState(initialFilters.type);
  const [q, setQ] = useState(initialFilters.q);
  const isFirstRender = useRef(true);

  // タイトル検索のデバウンス発火時に、テーマ/フェーズ/週/種別セレクトの最新値を
  // 参照するためのref（stateをそのままuseEffectの依存にすると発火のたびにタイマーが
  // リセットされてしまうため、qのみを依存にしつつrefで最新値を追う）
  const latestFilters = useRef({ theme, phase, week, type });
  latestFilters.current = { theme, phase, week, type };

  const visiblePhases = phases.filter((p) => !theme || String(p.themeId) === theme);
  const visibleWeeks = weeks.filter((w) => !phase || String(w.phaseId) === phase);

  function updateQuery(next: ContentsFilterValues) {
    const query = new URLSearchParams();
    if (next.theme) query.set("theme", next.theme);
    if (next.phase) query.set("phase", next.phase);
    if (next.week) query.set("week", next.week);
    if (next.type) query.set("type", next.type);
    if (next.q) query.set("q", next.q);
    const queryString = query.toString();
    router.replace(queryString ? `/manage/contents?${queryString}` : "/manage/contents");
  }

  function handleThemeChange(value: string) {
    setTheme(value);
    setPhase("");
    setWeek("");
    updateQuery({ theme: value, phase: "", week: "", type, q });
  }

  function handlePhaseChange(value: string) {
    setPhase(value);
    setWeek("");
    updateQuery({ theme, phase: value, week: "", type, q });
  }

  function handleWeekChange(value: string) {
    setWeek(value);
    updateQuery({ theme, phase, week: value, type, q });
  }

  function handleTypeChange(value: string) {
    setType(value);
    updateQuery({ theme, phase, week, type: value, q });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: マウント時のURL更新を避けるため依存はqのみに絞る
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      updateQuery({ ...latestFilters.current, q });
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4">
      <div className="space-y-1">
        <Label htmlFor="filter-theme">テーマ</Label>
        <select
          id="filter-theme"
          value={theme}
          onChange={(e) => handleThemeChange(e.target.value)}
          className={SELECT_CLASS_NAME}
        >
          <option value="">すべて</option>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="filter-phase">フェーズ</Label>
        <select
          id="filter-phase"
          value={phase}
          onChange={(e) => handlePhaseChange(e.target.value)}
          className={SELECT_CLASS_NAME}
        >
          <option value="">すべて</option>
          {visiblePhases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="filter-week">週</Label>
        <select
          id="filter-week"
          value={week}
          onChange={(e) => handleWeekChange(e.target.value)}
          className={SELECT_CLASS_NAME}
        >
          <option value="">すべて</option>
          {visibleWeeks.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="filter-type">種別</Label>
        <select
          id="filter-type"
          value={type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className={SELECT_CLASS_NAME}
        >
          <option value="">すべて</option>
          {CONTENT_TYPE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="filter-q">タイトル検索</Label>
        <Input
          id="filter-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="タイトルで検索"
        />
      </div>
    </div>
  );
}

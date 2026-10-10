"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  isContentType,
  type PhaseFilterOption,
  type ThemeFilterOption,
  type WeekFilterOption,
} from "@/app/lib/content-filtering";
import type { ContentType } from "@/app/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONTENT_TYPE_FILTER_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "video", label: "動画" },
  { value: "text", label: "テキスト" },
  { value: "exercise", label: "演習" },
  { value: "slide", label: "スライド（PDF）" },
  { value: "quiz", label: "クイズ" },
];

const SELECT_CLASS_NAME =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

interface ContentsFilterBarProps {
  themes: ThemeFilterOption[];
  phases: PhaseFilterOption[];
  weeks: WeekFilterOption[];
}

interface ContentsFilterValues {
  theme: string;
  phase: string;
  week: string;
  type: string;
  q: string;
}

/**
 * Theme/phase/week/type render straight from useSearchParams() as the single source of truth:
 * mirroring them in local state would miss URL changes from outside this component (the "clear
 * filters" link, browser back/forward) and leave a stale selection. Only the title search uses
 * debounced local state, to avoid a URL update per keystroke.
 */
export function ContentsFilterBar({ themes, phases, weeks }: ContentsFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const theme = searchParams.get("theme") ?? "";
  const phase = searchParams.get("phase") ?? "";
  const week = searchParams.get("week") ?? "";
  // For an invalid type from a hand-typed URL the server ignores it and shows everything, so
  // normalize the select to "all" to keep the UI consistent with the results.
  const rawType = searchParams.get("type") ?? "";
  const type = isContentType(rawType) ? rawType : "";
  const urlQ = searchParams.get("q") ?? "";

  const [q, setQ] = useState(urlQ);

  // Follow external changes to q in the URL (clear, back/forward) in the input. Don't overwrite
  // when our own debounce commit (trailing-space trim) wrote back a semantically equal value; e.g.
  // syncing q="hello" while typing "hello " would concatenate the next characters without the
  // space.
  useEffect(() => {
    setQ((prevQ) => (urlQ === prevQ.trim() ? prevQ : urlQ));
  }, [urlQ]);

  const visiblePhases = phases.filter((p) => !theme || String(p.themeId) === theme);
  const visiblePhaseIds = new Set(visiblePhases.map((p) => p.id));
  const visibleWeeks = weeks.filter((w) => {
    if (phase) return String(w.phaseId) === phase;
    if (theme) return visiblePhaseIds.has(w.phaseId);
    return true;
  });

  const updateQuery = useCallback(
    (next: ContentsFilterValues) => {
      const query = new URLSearchParams();
      if (next.theme) query.set("theme", next.theme);
      if (next.phase) query.set("phase", next.phase);
      if (next.week) query.set("week", next.week);
      if (next.type) query.set("type", next.type);
      const trimmedQ = next.q.trim();
      if (trimmedQ) query.set("q", trimmedQ);
      const queryString = query.toString();
      router.replace(queryString ? `/manage/contents?${queryString}` : "/manage/contents");
    },
    [router]
  );

  function handleThemeChange(value: string) {
    updateQuery({ theme: value, phase: "", week: "", type, q });
  }

  function handlePhaseChange(value: string) {
    updateQuery({ theme, phase: value, week: "", type, q });
  }

  function handleWeekChange(value: string) {
    updateQuery({ theme, phase, week: value, type, q });
  }

  function handleTypeChange(value: string) {
    updateQuery({ theme, phase, week, type: value, q });
  }

  useEffect(() => {
    if (q.trim() === urlQ) return;
    const timer = setTimeout(() => {
      updateQuery({ theme, phase, week, type, q });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, urlQ, theme, phase, week, type, updateQuery]);

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

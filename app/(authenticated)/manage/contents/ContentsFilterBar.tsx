"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  { value: "slide", label: "スライド（PDF）" },
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
 * テーマ/フェーズ/週/種別は useSearchParams() を唯一の情報源として直接描画する
 * （ローカルstateに複製すると、「フィルタをクリア」リンクやブラウザの戻る/進むといった
 * このコンポーネント外からのURL変化に追従できず、古い選択状態が残ってしまうため）。
 * タイトル検索のみ、入力のたびの過剰なURL更新を避けるためローカルstateでデバウンスする。
 */
export function ContentsFilterBar({ themes, phases, weeks }: ContentsFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const theme = searchParams.get("theme") ?? "";
  const phase = searchParams.get("phase") ?? "";
  const week = searchParams.get("week") ?? "";
  const type = searchParams.get("type") ?? "";
  const urlQ = searchParams.get("q") ?? "";

  const [q, setQ] = useState(urlQ);

  // URL側のqが外部要因（フィルタクリア・戻る/進む等）で変わったら入力欄も追従させる
  useEffect(() => {
    setQ(urlQ);
  }, [urlQ]);

  // フェーズは選択中のテーマ配下のみ、週は選択中のフェーズ（未選択ならテーマ）配下のみに絞る
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
      if (next.q) query.set("q", next.q);
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
    if (q === urlQ) return;
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

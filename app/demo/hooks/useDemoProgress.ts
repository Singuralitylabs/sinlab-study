"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "demo_progress_v1";

type ProgressMap = Record<number, boolean>;

function readFromStorage(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

function writeToStorage(progress: ProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage が使えない環境では無視
  }
}

export function useDemoProgress() {
  // SSR とクライアント初回描画を一致させるため、初期値は空。localStorage は effect で読む。
  const [progress, setProgress] = useState<ProgressMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProgress(readFromStorage());
    setHydrated(true);
  }, []);

  const isCompleted = useCallback(
    (contentId: number) => (hydrated ? (progress[contentId] ?? false) : false),
    [hydrated, progress]
  );

  const toggleComplete = useCallback((contentId: number) => {
    setProgress((prev) => {
      const next = { ...prev, [contentId]: !prev[contentId] };
      writeToStorage(next);
      return next;
    });
  }, []);

  const completedCount = useCallback(
    (contentIds: number[]) => (hydrated ? contentIds.filter((id) => progress[id]).length : 0),
    [hydrated, progress]
  );

  return { isCompleted, toggleComplete, completedCount, hydrated };
}

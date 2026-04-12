"use client";

import { useCallback, useState } from "react";

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
  const [progress, setProgress] = useState<ProgressMap>(() => readFromStorage());

  const isCompleted = useCallback((contentId: number) => progress[contentId] ?? false, [progress]);

  const toggleComplete = useCallback((contentId: number) => {
    setProgress((prev) => {
      const next = { ...prev, [contentId]: !prev[contentId] };
      writeToStorage(next);
      return next;
    });
  }, []);

  const completedCount = useCallback(
    (contentIds: number[]) => contentIds.filter((id) => progress[id]).length,
    [progress]
  );

  return { isCompleted, toggleComplete, completedCount };
}

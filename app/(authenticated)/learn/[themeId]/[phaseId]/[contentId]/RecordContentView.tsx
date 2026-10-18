"use client";

import { useEffect } from "react";

/** Records last_viewed_at via API after paint so the Server Component never writes (#396). */
export function RecordContentView({ contentId }: { contentId: number }) {
  useEffect(() => {
    void fetch("/api/progress/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId }),
    }).catch(() => {
      // Best-effort; continue-learning falls back to completions when views are missing.
    });
  }, [contentId]);

  return null;
}

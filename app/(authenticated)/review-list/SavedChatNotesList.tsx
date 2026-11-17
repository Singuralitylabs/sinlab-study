"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import type { SavedChatNoteView } from "@/app/lib/ai-chat-saved-notes";
import { formatDate } from "@/app/lib/format-date";
import { Button } from "@/components/ui/button";

function groupByTheme(notes: SavedChatNoteView[]) {
  const groups: { themeId: number; themeName: string; notes: SavedChatNoteView[] }[] = [];
  for (const note of notes) {
    const last = groups[groups.length - 1];
    if (last && last.themeId === note.themeId) {
      last.notes.push(note);
    } else {
      groups.push({ themeId: note.themeId, themeName: note.themeName, notes: [note] });
    }
  }
  return groups;
}

export function SavedChatNotesList({
  initialNotes,
  loadFailed,
}: {
  initialNotes: SavedChatNoteView[];
  loadFailed: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loadFailed) {
    return (
      <p className="text-sm text-destructive py-8 text-center">
        シンラビに聞いたことの取得に失敗しました。時間をおいて再読み込みしてください。
      </p>
    );
  }

  async function remove(id: number) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch("/api/ai-chat/saved-notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // 404 means it is already gone (deleted in another tab), which is what the learner wanted.
      if (res.ok || res.status === 404) {
        setNotes((prev) => prev.filter((note) => note.id !== id));
      } else {
        setError("削除に失敗しました。時間をおいてもう一度試してください。");
      }
    } catch {
      setError("削除に失敗しました。時間をおいてもう一度試してください。");
    } finally {
      setDeleting(null);
    }
  }

  if (notes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        まだありません。記事や演習の画面で「シンラビに相談」し、残したい回答を「復習リストに残す」で保存すると、ここに並びます。
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {groupByTheme(notes).map((group) => (
        <section key={group.themeId}>
          <h2 className="text-lg font-semibold mb-3">{group.themeName}</h2>
          <ul className="space-y-4">
            {group.notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={note.href} className="font-medium text-primary hover:underline">
                      {note.contentTitle}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(note.createdAt)} に保存
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={deleting === note.id}
                    onClick={() => void remove(note.id)}
                    aria-label="削除"
                    title="削除"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <p className="text-sm font-medium whitespace-pre-wrap">Q. {note.question}</p>
                <details className="group">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    <span className="group-open:hidden">シンラビの回答を見る</span>
                    <span className="hidden group-open:inline">回答を閉じる</span>
                  </summary>
                  <div className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">
                    <MarkdownRenderer content={note.answer} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

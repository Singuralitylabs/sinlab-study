"use client";

import Link from "next/link";
import { useState } from "react";
import { type ThemeCompletionNotice, themeCompletionCopy } from "@/app/lib/certificate-eligibility";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shown once, for the action that just finished the theme (progress save or a completed review).
 * Reloading the page does not send the payload again, so the dialog does not come back. Parents
 * remount via `key` (or null → notice) when a newer notice must reopen after dismiss.
 */
export function ThemeCompletionDialog({ notice }: { notice: ThemeCompletionNotice }) {
  const [open, setOpen] = useState(true);
  const copy = themeCompletionCopy(notice);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full sm:max-w-md" data-testid="theme-completion-dialog">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button asChild className="w-full sm:w-auto">
            <Link href={copy.href}>{copy.linkLabel}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

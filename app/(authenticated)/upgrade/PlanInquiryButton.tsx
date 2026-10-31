"use client";

import { FeedbackDialog } from "@/app/(authenticated)/components/FeedbackDialog";
import { Button } from "@/components/ui/button";

/** Opens the feedback dialog with 「プランの相談」 preselected (#394 / #408). */
export function PlanInquiryButton({ compact = false }: { compact?: boolean }) {
  return (
    <FeedbackDialog
      defaultCategory="plan_inquiry"
      trigger={
        compact ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            問い合わせる
          </button>
        ) : (
          <Button type="button" variant="outline">
            問い合わせる
          </Button>
        )
      }
    />
  );
}

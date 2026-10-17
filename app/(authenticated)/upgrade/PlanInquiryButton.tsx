"use client";

import { FeedbackDialog } from "@/app/(authenticated)/components/FeedbackDialog";
import { Button } from "@/components/ui/button";

/** Opens the feedback dialog with 「プランの相談」 preselected (#394). */
export function PlanInquiryButton() {
  return (
    <FeedbackDialog
      defaultCategory="plan_inquiry"
      trigger={
        <Button type="button" variant="outline">
          問い合わせる
        </Button>
      }
    />
  );
}

import { BookOpen, CheckCircle, CircleDashed } from "lucide-react";
import { PHASE_PROGRESS_STATUS, type PhaseProgressStatus } from "@/app/lib/phase-progress";

export function PhaseStatusIcon({ status }: { status: PhaseProgressStatus }) {
  if (status === PHASE_PROGRESS_STATUS.COMPLETED) {
    return (
      <div className="p-3 bg-success/15 rounded-full shrink-0">
        <CheckCircle aria-label="完了" className="h-6 w-6 text-success" />
      </div>
    );
  }
  if (status === PHASE_PROGRESS_STATUS.IN_PROGRESS) {
    return (
      <div className="p-3 bg-primary/10 rounded-full shrink-0">
        <CircleDashed aria-label="進行中" className="h-6 w-6 text-primary" />
      </div>
    );
  }
  return (
    <div className="p-3 bg-primary/10 rounded-full shrink-0">
      <BookOpen aria-label="未着手" className="h-6 w-6 text-primary" />
    </div>
  );
}

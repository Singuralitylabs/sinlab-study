import { BookOpen, CheckCircle, Lock, PlayCircle } from "lucide-react";
import { PHASE_PROGRESS_STATUS, type PhaseProgressStatus } from "@/app/lib/phase-progress";

export function PhaseStatusIcon({
  status,
  locked = false,
}: {
  status: PhaseProgressStatus;
  locked?: boolean;
}) {
  if (locked) {
    return (
      <div className="p-3 bg-muted rounded-full shrink-0">
        <Lock aria-label="有料会員向け" className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  if (status === PHASE_PROGRESS_STATUS.COMPLETED) {
    return (
      <div className="p-3 bg-success/15 rounded-full shrink-0">
        <CheckCircle aria-label="完了" className="h-6 w-6 text-success" />
      </div>
    );
  }
  if (status === PHASE_PROGRESS_STATUS.IN_PROGRESS) {
    return (
      <div className="p-3 bg-amber-100 rounded-full shrink-0 dark:bg-amber-500/20">
        <PlayCircle aria-label="進行中" className="h-6 w-6 text-amber-600 dark:text-amber-400" />
      </div>
    );
  }
  return (
    <div className="p-3 bg-primary/10 rounded-full shrink-0">
      <BookOpen aria-label="未着手" className="h-6 w-6 text-primary" />
    </div>
  );
}

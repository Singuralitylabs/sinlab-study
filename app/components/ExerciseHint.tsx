import Image from "next/image";
import { HINT_MASCOT } from "@/app/constants/mascot";

interface ExerciseHintProps {
  hint: string;
}

// Native <details> keeps keyboard toggling and screen-reader semantics without client state; the
// mascot swap and bubble are pure CSS via group-open.
export function ExerciseHint({ hint }: ExerciseHintProps) {
  return (
    <details className="group mt-4">
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className="relative h-16 w-14 shrink-0 sm:h-20 sm:w-16">
          <Image
            src={HINT_MASCOT.closed.src}
            alt=""
            width={HINT_MASCOT.closed.width}
            height={HINT_MASCOT.closed.height}
            sizes="64px"
            className="h-full w-full object-contain group-open:hidden"
          />
          <Image
            src={HINT_MASCOT.open.src}
            alt=""
            width={HINT_MASCOT.open.width}
            height={HINT_MASCOT.open.height}
            sizes="64px"
            loading="eager"
            className="hidden h-full w-full object-contain group-open:block"
          />
        </span>
        <span className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground group-open:text-foreground">
          シンラビにヒントを聞く
        </span>
      </summary>
      <div className="relative mt-3 ml-6 rounded-2xl border border-border bg-muted px-4 py-3 text-sm whitespace-pre-wrap">
        <span
          aria-hidden="true"
          className="absolute -top-1.5 left-6 size-3 rotate-45 border-t border-l border-border bg-muted"
        />
        {hint}
      </div>
    </details>
  );
}

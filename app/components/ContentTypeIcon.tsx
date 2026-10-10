import { FileText, ListChecks, PenLine, Play, Presentation } from "lucide-react";
import type { ContentType } from "@/app/types";

// Keyed by ContentType so adding a type fails to compile until it has an icon.
const ICONS: Record<ContentType, typeof FileText> = {
  video: Play,
  text: FileText,
  exercise: PenLine,
  slide: Presentation,
  quiz: ListChecks,
};

export function ContentTypeIcon({ type, className }: { type: ContentType; className?: string }) {
  const Icon = ICONS[type] ?? FileText;
  return <Icon className={className} />;
}

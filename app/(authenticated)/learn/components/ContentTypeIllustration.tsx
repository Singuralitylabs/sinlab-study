import type { ReactNode } from "react";
import type { ContentType } from "@/app/types";

// Drawn in currentColor so the tint comes from CONTENT_TYPE_ACCENT_CLASSES and follows the theme;
// keyed by ContentType so a new type fails to compile until it has an illustration.
const SHAPES: Record<ContentType, ReactNode> = {
  video: (
    <>
      <rect x="26" y="12" width="108" height="66" rx="8" fill="currentColor" fillOpacity=".14" />
      <rect x="26" y="12" width="108" height="66" rx="8" />
      <path d="M72 29v26l22-13z" fill="currentColor" />
      <path d="M40 67h80" strokeOpacity=".3" />
      <path d="M40 67h46" />
      <circle cx="86" cy="67" r="3" fill="currentColor" />
    </>
  ),
  text: (
    <>
      <rect x="48" y="8" width="64" height="74" rx="6" fill="currentColor" fillOpacity=".14" />
      <rect x="48" y="8" width="64" height="74" rx="6" />
      <path d="M60 24h26" strokeWidth="5" />
      <path d="M60 38h40M60 48h40M60 58h40M60 68h24" strokeOpacity=".5" />
      <path d="M98 8v14l5-4 5 4V8" fill="currentColor" />
    </>
  ),
  exercise: (
    <>
      <rect x="22" y="12" width="104" height="66" rx="8" fill="currentColor" fillOpacity=".14" />
      <rect x="22" y="12" width="104" height="66" rx="8" />
      <path d="M22 26h104" />
      <circle cx="32" cy="19" r="1.5" fill="currentColor" />
      <circle cx="39" cy="19" r="1.5" fill="currentColor" />
      <circle cx="46" cy="19" r="1.5" fill="currentColor" />
      <path d="M34 38h30M44 48h46M44 58h30M34 68h20" strokeOpacity=".5" />
      <circle cx="124" cy="68" r="15" fill="currentColor" stroke="none" />
      <path d="M116 68l6 6 11-12" className="stroke-card" />
    </>
  ),
  slide: (
    <>
      <rect x="26" y="10" width="108" height="56" rx="6" fill="currentColor" fillOpacity=".14" />
      <rect x="26" y="10" width="108" height="56" rx="6" />
      <path d="M38 22h30" strokeWidth="4" />
      <path d="M46 58V44M64 58V36M82 58V48M100 58V30M118 58V40" strokeWidth="7" />
      <path d="M80 66v12M62 78h36" />
    </>
  ),
  quiz: (
    <>
      <circle cx="42" cy="24" r="6" />
      <circle cx="42" cy="45" r="6" fill="currentColor" />
      <circle cx="42" cy="66" r="6" />
      <path d="M58 24h62M58 66h50" strokeOpacity=".5" />
      <path d="M58 45h62" />
    </>
  ),
};

export function ContentTypeIllustration({
  type,
  className,
}: {
  type: ContentType;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 90"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {SHAPES[type]}
    </svg>
  );
}

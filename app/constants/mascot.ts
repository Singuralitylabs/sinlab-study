export interface PhaseCompletionMascot {
  src: string;
  alt: string;
}

/**
 * Keyed by theme name (the seed SQL also identifies themes by name; ids differ per environment).
 * A theme renamed in /manage silently loses its mascot and falls back to the text-only banner.
 * Other courses get their own characters, so a theme without an entry must stay image-free.
 */
export const PHASE_COMPLETION_MASCOTS: Readonly<Record<string, PhaseCompletionMascot>> = {
  シンラビのWeb開発講座: { src: "/images/mascot/shinrabi-cheer.webp", alt: "応援するシンラビ" },
};

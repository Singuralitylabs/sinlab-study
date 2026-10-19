export interface PhaseCompletionMascot {
  src: string;
  alt: string;
}

/** Shown on every phase completion banner: シンラビ explains all themes, so no per-theme lookup. */
export const PHASE_COMPLETION_MASCOT: PhaseCompletionMascot = {
  src: "/images/mascot/shinrabi-cheer.webp",
  alt: "応援するシンラビ",
};

/** Shown on every theme completion banner, for the same reason as PHASE_COMPLETION_MASCOT. */
export const THEME_COMPLETION_MASCOT: PhaseCompletionMascot = {
  src: "/images/mascot/shinrabi-congratulations.webp",
  alt: "お祝いするシンラビ",
};

/**
 * Shown on every certificate: シンラビ explains all themes, so no per-theme lookup. The 800px
 * source (not the 480px banner image) keeps the A4 print sharp: the mascot is about 62mm wide.
 */
export const CERTIFICATE_MASCOT: PhaseCompletionMascot = {
  src: "/images/mascot/shinrabi-congratulations-large.webp",
  alt: "お祝いするシンラビ",
};

/** Shown beside the /login catch copy. Decorative: the heading beside it already carries the message. */
export const LOGIN_MASCOT = {
  src: "/images/mascot/shinrabi-wave.webp",
  width: 360,
  height: 477,
};

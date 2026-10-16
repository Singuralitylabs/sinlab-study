/** Exact paths the proxy may skip for installability. Do not add prefixes or extra files. */
export const PWA_PUBLIC_PATHS = [
  "/manifest.webmanifest",
  "/sw.js",
  "/offline",
  "/apple-icon.png",
] as const;

export const PWA_NAME = "Sinlab Study";

/**
 * Manifest and viewport theme colors are sRGB stand-ins for the light/dark tokens in
 * globals.css (oklch is not valid in a web manifest).
 */
export const PWA_THEME_COLOR_LIGHT = "#2451d6";
export const PWA_THEME_COLOR_DARK = "#6b93f0";
export const PWA_BACKGROUND_COLOR = "#f3f6fb";

export const INSTALL_PROMPT_DISMISS_KEY = "sinlab-pwa-install-dismissed";

export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent);
}

/** iOS cannot fire beforeinstallprompt; any iPhone/iPad UA gets the share-sheet steps. */
export function installPromptPlatform(userAgent: string): "ios" | "android" {
  return /iPhone|iPad|iPod/i.test(userAgent) ? "ios" : "android";
}

export function shouldShowInstallPrompt(input: {
  isStandalone: boolean;
  isMobile: boolean;
  dismissed: boolean;
}): boolean {
  return input.isMobile && !input.isStandalone && !input.dismissed;
}

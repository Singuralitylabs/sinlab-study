/** Exact paths the proxy may skip for installability. Do not add prefixes or extra files.
 * Only `/offline` is not already covered by STATIC_FILE_EXTENSIONS / the matcher; the other
 * three stay listed so the allowlist stays explicit and does not grow casually. */
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

/** iPadOS 13+ reports as Macintosh; maxTouchPoints > 1 distinguishes it from desktop Mac. */
export function isIosUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return true;
  }
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function isMobileUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
  if (/Android/i.test(userAgent)) {
    return true;
  }
  return isIosUserAgent(userAgent, maxTouchPoints);
}

/** iOS cannot fire beforeinstallprompt; any iPhone/iPad UA gets the share-sheet steps. */
export function installPromptPlatform(userAgent: string, maxTouchPoints = 0): "ios" | "android" {
  return isIosUserAgent(userAgent, maxTouchPoints) ? "ios" : "android";
}

/** iOS home-screen apps often expose navigator.standalone when display-mode is unavailable. */
export function isStandaloneDisplay(input: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
}): boolean {
  return input.displayModeStandalone || input.navigatorStandalone === true;
}

export function shouldShowInstallPrompt(input: {
  isStandalone: boolean;
  isMobile: boolean;
  dismissed: boolean;
}): boolean {
  return input.isMobile && !input.isStandalone && !input.dismissed;
}

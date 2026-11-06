const KEY = "sinlab:push-home-optout";

/**
 * A device where the user turned push off in /settings stops getting the home nudge. Storage can
 * throw (private mode, blocked cookies), and showing the nudge is the safe fallback there.
 */
export function isPushHomeOptedOut(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setPushHomeOptOut(optedOut: boolean): void {
  try {
    if (optedOut) {
      window.localStorage.setItem(KEY, "1");
    } else {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    // Ignored: the preference is a convenience, not a requirement.
  }
}

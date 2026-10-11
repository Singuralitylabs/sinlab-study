export const LIGHT_ONLY_PATH_PREFIXES = ["/login", "/demo", "/rejected"] as const;

// Inlined via toString() into the head script, so it must not reference outer symbols.
export function shouldUseOsColorScheme(pathname: string, prefixes: readonly string[]): boolean {
  for (let i = 0; i < prefixes.length; i++) {
    const p = prefixes[i];
    if (pathname === p || pathname.indexOf(p + "/") === 0) return false;
  }
  return true;
}

export function buildColorSchemeInitScript(): string {
  return `try{if((${shouldUseOsColorScheme.toString()})(location.pathname,${JSON.stringify(
    LIGHT_ONLY_PATH_PREFIXES
  )})&&window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark")}catch(e){}`;
}

// Unauthenticated screens stay light regardless of the OS setting (first impression / LP
// consistency). Prefix match covers nested routes such as /demo/[themeId].
export const LIGHT_ONLY_PATH_PREFIXES = ["/login", "/demo", "/rejected"] as const;

// Must stay self-contained: layout.tsx inlines its source (toString) into a blocking head script so
// the first paint already has the right class. Referencing outer symbols would break there.
export function shouldUseOsColorScheme(pathname: string, prefixes: readonly string[]): boolean {
  for (let i = 0; i < prefixes.length; i++) {
    const p = prefixes[i];
    if (pathname === p || pathname.indexOf(p + "/") === 0) return false;
  }
  return true;
}

// The .dark class is the single switch for Tailwind dark: variants, portals and CodeEditor, so it is
// toggled on <html> instead of scoping by wrapper element.
export function buildColorSchemeInitScript(): string {
  return `try{if((${shouldUseOsColorScheme.toString()})(location.pathname,${JSON.stringify(
    LIGHT_ONLY_PATH_PREFIXES
  )})&&window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark")}catch(e){}`;
}

import { describe, expect, it } from "vitest";
import {
  buildColorSchemeInitScript,
  LIGHT_ONLY_PATH_PREFIXES,
  shouldUseOsColorScheme,
} from "@/app/lib/color-scheme";

describe("shouldUseOsColorScheme", () => {
  it.each(["/login", "/demo", "/demo/1", "/demo/1/2", "/rejected"])("%s is light-only", (p) => {
    expect(shouldUseOsColorScheme(p, LIGHT_ONLY_PATH_PREFIXES)).toBe(false);
  });

  it.each(["/", "/dashboard", "/learning", "/demonstration", "/login-help", "/admin"])(
    "%s follows the OS",
    (p) => {
      expect(shouldUseOsColorScheme(p, LIGHT_ONLY_PATH_PREFIXES)).toBe(true);
    }
  );
});

describe("buildColorSchemeInitScript", () => {
  const run = (pathname: string, prefersDark: boolean) => {
    const classes = new Set<string>();
    const fn = new Function("location", "window", "document", buildColorSchemeInitScript());
    fn(
      { pathname },
      { matchMedia: () => ({ matches: prefersDark }) },
      { documentElement: { classList: { add: (c: string) => classes.add(c) } } }
    );
    return classes.has("dark");
  };

  it("adds dark only on OS-following paths when the OS prefers dark", () => {
    expect(run("/learning", true)).toBe(true);
    expect(run("/learning", false)).toBe(false);
    expect(run("/login", true)).toBe(false);
    expect(run("/demo/3", true)).toBe(false);
    expect(run("/rejected", true)).toBe(false);
  });
});

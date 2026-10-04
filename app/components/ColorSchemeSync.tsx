"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { LIGHT_ONLY_PATH_PREFIXES, shouldUseOsColorScheme } from "@/app/lib/color-scheme";

// The head script only runs on full loads; client navigations (<Link>) between light-only and
// OS-following screens need the .dark class re-evaluated, or one side stays stuck on the other's theme.
export function ColorSchemeSync() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    const dark =
      shouldUseOsColorScheme(pathname, LIGHT_ONLY_PATH_PREFIXES) &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", dark);
  }, [pathname]);

  return null;
}

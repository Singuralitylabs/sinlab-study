"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { LIGHT_ONLY_PATH_PREFIXES, shouldUseOsColorScheme } from "@/app/lib/color-scheme";

// The head script only runs on full loads; <Link> navigations need .dark re-evaluated.
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

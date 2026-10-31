"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type ManageGroupNavItem = {
  title: string;
  href: string;
  /** Rendered element, not a component: props must cross the server→client boundary. */
  icon: ReactNode;
};

const BULK_HREF = "/manage/contents/bulk";

/**
 * Prefer the longest matching href so `/manage/contents/bulk` does not also activate
 * `/manage/contents` (#467).
 */
export function isManageGroupNavActive(
  pathname: string,
  href: string,
  allHrefs: readonly string[],
  from?: string | null
): boolean {
  if (href === "/manage") {
    return pathname === "/manage";
  }
  // Edit/delete pages opened from the bulk tab keep the URL under /manage/contents/[id], so only
  // the query tells which tab the user came from (matches the post-action return target).
  if (from === "bulk" && pathname.startsWith("/manage/contents/") && allHrefs.includes(BULK_HREF)) {
    return href === BULK_HREF;
  }
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) {
    return false;
  }
  return !allHrefs.some(
    (other) =>
      other !== href &&
      other.length > href.length &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`))
  );
}

export function ManageGroupNav({ items }: { items: ManageGroupNavItem[] }) {
  const pathname = usePathname();
  const from = useSearchParams().get("from");
  const allHrefs = items.map((item) => item.href);

  return (
    <nav className="mb-6 overflow-x-auto">
      <div className="flex gap-1 pb-2">
        {items.map((item) => {
          const active = isManageGroupNavActive(pathname, item.href, allHrefs, from);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {item.icon}
              {item.title}
            </Link>
          );
        })}
      </div>
      <Separator />
    </nav>
  );
}

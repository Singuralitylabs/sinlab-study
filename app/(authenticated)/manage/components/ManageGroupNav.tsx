"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type ManageGroupNavItem = {
  title: string;
  href: string;
  /** Rendered element, not a component: props must cross the server→client boundary. */
  icon: ReactNode;
};

export function ManageGroupNav({ items }: { items: ManageGroupNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mb-6 overflow-x-auto">
      <div className="flex gap-1 pb-2">
        {items.map((item) => {
          const active =
            item.href === "/manage"
              ? pathname === "/manage"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
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

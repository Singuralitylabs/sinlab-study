"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type ManageGroupNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
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
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </div>
      <Separator />
    </nav>
  );
}

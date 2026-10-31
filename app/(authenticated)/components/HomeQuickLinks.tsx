import { BookOpen, Megaphone } from "lucide-react";
import Link from "next/link";

const LINKS = [
  { href: "/learn", label: "学習コンテンツ", icon: BookOpen },
  { href: "/announcements", label: "お知らせ", icon: Megaphone },
] as const;

/** Compact row for mobile when SideNav is in a drawer. Hidden from sm up to match SideNav's `hidden sm:flex`. */
export function HomeQuickLinks() {
  return (
    <nav
      aria-label="クイックリンク"
      className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:hidden"
    >
      {LINKS.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
          >
            <Icon className="h-3.5 w-3.5" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

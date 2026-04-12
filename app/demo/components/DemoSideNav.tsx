"use client";

import { BookOpen, LogIn, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const NAV_ITEMS = [
  {
    title: "デモ学習",
    href: "/demo",
    icon: <BookOpen className="h-5 w-5" />,
  },
];

export function DemoSideNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => pathname.startsWith(href);

  const NavLink = ({
    title,
    href,
    icon,
    onClick,
  }: {
    title: string;
    href: string;
    icon: React.ReactNode;
    onClick?: () => void;
  }) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        onClick={onClick}
        className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        {icon}
        {title}
      </Link>
    );
  };

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.title} {...item} onClick={onItemClick} />
        ))}
      </nav>
      <div className="px-3 pb-4">
        <Separator className="mb-3" />
        <Link
          href="/login"
          onClick={onItemClick}
          className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/10"
        >
          <LogIn className="h-5 w-5" />
          ログインして続ける
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* ハンバーガーメニュー (モバイル用) */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden fixed top-12 left-4 z-40"
        aria-label="メニューを開く"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* モバイル用シート */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-6 py-5 border-b border-border">
            <SheetTitle>
              <Link
                href="/demo"
                onClick={() => setOpen(false)}
                className="text-lg font-bold flex items-center gap-2"
              >
                <Image src="/icon.png" alt="Sinlab Study" width={24} height={24} />
                Sinlab Study
                <span className="text-xs font-normal text-muted-foreground ml-1">DEMO</span>
              </Link>
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-[calc(100%-73px)]">
            <SidebarContent onItemClick={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* デスクトップ用サイドバー */}
      <div className="hidden sm:flex h-screen w-64 flex-col fixed left-0 top-0 border-r border-sidebar-border bg-sidebar">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <Link href="/demo" className="text-xl font-bold flex items-center gap-2">
            <Image src="/icon.png" alt="Sinlab Study" width={28} height={28} />
            Sinlab Study
            <span className="text-xs font-normal text-muted-foreground ml-1">DEMO</span>
          </Link>
        </div>
        <div className="flex flex-col flex-1 pt-2">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}

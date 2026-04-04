"use client";

import { BookOpen, ClipboardList, House, LogOut, Menu, Settings, UserCog } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { createClientSupabaseClient } from "@/app/services/api/supabase-client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  {
    title: "ホーム",
    href: "/",
    icon: <House className="h-5 w-5" />,
  },
  {
    title: "学習コンテンツ",
    href: "/learn",
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    title: "提出履歴",
    href: "/submissions",
    icon: <ClipboardList className="h-5 w-5" />,
  },
];

const MANAGE_NAV_ITEM: NavItem = {
  title: "管理画面",
  href: "/manage",
  icon: <Settings className="h-5 w-5" />,
};

const ADMIN_USERS_NAV_ITEM: NavItem = {
  title: "ユーザー管理",
  href: "/admin/users",
  icon: <UserCog className="h-5 w-5" />,
};

export function SideNav({ isAdmin, isInstructor }: { isAdmin: boolean; isInstructor: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const navItems = useMemo<NavItem[]>(
    () => [
      ...DEFAULT_NAV_ITEMS,
      ...(isInstructor ? [MANAGE_NAV_ITEM] : []),
      ...(isAdmin ? [ADMIN_USERS_NAV_ITEM] : []),
    ],
    [isAdmin, isInstructor]
  );

  const handleSignOut = async () => {
    const supabase = createClientSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const NavLink = ({ item, onClick }: { item: NavItem; onClick?: () => void }) => {
    const active = isActive(item.href);

    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        {item.icon}
        {item.title}
      </Link>
    );
  };

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map((item) => (
          <NavLink key={item.title} item={item} onClick={onItemClick} />
        ))}
      </nav>
      <div className="px-3 pb-4">
        <Separator className="mb-3" />
        <button
          type="button"
          onClick={() => {
            handleSignOut();
            onItemClick?.();
          }}
          className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-accent w-full text-left"
        >
          <LogOut className="h-5 w-5" />
          ログアウト
        </button>
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
        className="sm:hidden fixed top-4 left-4 z-50"
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
                href="/"
                onClick={() => setOpen(false)}
                className="text-lg font-bold flex items-center gap-2"
              >
                <Image src="/icon.png" alt="Sinlab Study" width={24} height={24} />
                Sinlab Study
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
          <Link href="/" className="text-xl font-bold flex items-center gap-2">
            <Image src="/icon.png" alt="Sinlab Study" width={28} height={28} />
            Sinlab Study
          </Link>
        </div>
        <div className="flex flex-col flex-1 pt-2">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}

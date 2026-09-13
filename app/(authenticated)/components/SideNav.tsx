"use client";

import {
  BookOpen,
  ClipboardList,
  CreditCard,
  House,
  LogOut,
  Menu,
  Settings,
  UserCog,
} from "lucide-react";
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

const UPGRADE_NAV_ITEM: NavItem = {
  title: "プラン・お支払い",
  href: "/upgrade",
  icon: <CreditCard className="h-5 w-5" />,
};

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

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function SideNavLink({
  item,
  pathname,
  onClick,
}: {
  item: NavItem;
  pathname: string;
  onClick?: () => void;
}) {
  const active = isNavActive(pathname, item.href);

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
}

function SideNavSidebarContent({
  navItems,
  pathname,
  onItemClick,
  onSignOut,
}: {
  navItems: NavItem[];
  pathname: string;
  onItemClick?: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map((item) => (
          <SideNavLink key={item.title} item={item} pathname={pathname} onClick={onItemClick} />
        ))}
      </nav>
      <div className="px-3 pb-4">
        <Separator className="mb-3" />
        <button
          type="button"
          onClick={() => {
            onSignOut();
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
}

export function SideNav({
  isAdmin,
  isInstructor,
  stripeEnabled,
}: {
  isAdmin: boolean;
  isInstructor: boolean;
  stripeEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const navItems = useMemo<NavItem[]>(
    () => [
      ...DEFAULT_NAV_ITEMS,
      // 停止中は決済・お支払い管理の導線を持たないため非表示にする（詳細はCLAUDE.md参照）
      ...(stripeEnabled ? [UPGRADE_NAV_ITEM] : []),
      ...(isInstructor ? [MANAGE_NAV_ITEM] : []),
      ...(isAdmin ? [ADMIN_USERS_NAV_ITEM] : []),
    ],
    [isAdmin, isInstructor, stripeEnabled]
  );

  const handleSignOut = async () => {
    const supabase = createClientSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

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
            <SideNavSidebarContent
              navItems={navItems}
              pathname={pathname}
              onItemClick={() => setOpen(false)}
              onSignOut={handleSignOut}
            />
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
          <SideNavSidebarContent
            navItems={navItems}
            pathname={pathname}
            onSignOut={handleSignOut}
          />
        </div>
      </div>
    </>
  );
}

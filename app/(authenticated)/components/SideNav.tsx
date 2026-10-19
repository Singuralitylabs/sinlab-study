"use client";

import {
  Award,
  BookOpen,
  ClipboardList,
  FileText,
  House,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clearLocalPushSubscription } from "@/app/lib/clear-local-push-subscription";
import { createClientSupabaseClient } from "@/app/services/api/supabase-client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FeedbackDialog } from "./FeedbackDialog";

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
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

const REVIEW_LIST_NAV_ITEM: NavItem = {
  title: "復習リスト",
  href: "/review-list",
  icon: <ListChecks className="h-5 w-5" />,
};

const CERTIFICATES_NAV_ITEM: NavItem = {
  title: "修了証",
  href: "/certificates",
  icon: <Award className="h-5 w-5" />,
};

function announcementsNavItem(badge: React.ReactNode): NavItem {
  return {
    title: "お知らせ",
    href: "/announcements",
    icon: <Megaphone className="h-5 w-5" />,
    badge,
  };
}

const CONTENT_MANAGE_NAV_ITEM: NavItem = {
  title: "コンテンツ管理",
  href: "/manage/contents",
  icon: <FileText className="h-5 w-5" />,
};

const STUDENT_MANAGE_NAV_ITEM: NavItem = {
  title: "受講生管理",
  href: "/manage",
  icon: <LayoutDashboard className="h-5 w-5" />,
};

const ADMIN_USERS_NAV_ITEM: NavItem = {
  title: "ユーザー管理",
  href: "/admin/users",
  icon: <UserCog className="h-5 w-5" />,
};

const SETTINGS_NAV_ITEM: NavItem = {
  title: "設定",
  href: "/settings",
  icon: <SlidersHorizontal className="h-5 w-5" />,
};

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // Student-manage group: do not highlight for /manage/contents|announcements|themes|…
  if (href === "/manage") {
    return (
      pathname === "/manage" ||
      pathname.startsWith("/manage/students") ||
      pathname.startsWith("/manage/submissions") ||
      pathname.startsWith("/manage/feedbacks")
    );
  }
  if (href === "/manage/contents") {
    return (
      pathname.startsWith("/manage/contents") ||
      pathname.startsWith("/manage/announcements") ||
      pathname.startsWith("/manage/themes") ||
      pathname.startsWith("/manage/phases")
    );
  }
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
      {item.badge}
    </Link>
  );
}

function SideNavSidebarContent({
  navItems,
  pathname,
  onItemClick,
  onSignOut,
  feedbackEnabled,
}: {
  navItems: NavItem[];
  pathname: string;
  onItemClick?: () => void;
  onSignOut: () => void;
  feedbackEnabled: boolean;
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
        {feedbackEnabled && <FeedbackDialog />}
        <SideNavLink item={SETTINGS_NAV_ITEM} pathname={pathname} onClick={onItemClick} />
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
  feedbackEnabled,
  showCertificates,
  showReviewList,
  announcementBadge,
}: {
  isAdmin: boolean;
  isInstructor: boolean;
  feedbackEnabled: boolean;
  showCertificates: boolean;
  /** Learners only (role = member); staff manage courses and do not use the review list. */
  showReviewList: boolean;
  /** Streamed unread badge slot (a Server Component under <Suspense>). */
  announcementBadge: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Not memoized: announcementBadge is a new element on every layout render, so a useMemo keyed
  // on it would never hit.
  const navItems: NavItem[] = [
    ...DEFAULT_NAV_ITEMS,
    ...(showReviewList ? [REVIEW_LIST_NAV_ITEM] : []),
    ...(showCertificates ? [CERTIFICATES_NAV_ITEM] : []),
    announcementsNavItem(announcementBadge),
    ...(isInstructor ? [CONTENT_MANAGE_NAV_ITEM, STUDENT_MANAGE_NAV_ITEM] : []),
    ...(isAdmin ? [ADMIN_USERS_NAV_ITEM] : []),
  ];

  const handleSignOut = async () => {
    await clearLocalPushSubscription();
    const supabase = createClientSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden fixed top-4 left-4 z-50 print:hidden"
        aria-label="メニューを開く"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-6 py-5 border-b border-border">
            <SheetTitle>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="text-lg font-bold flex items-center gap-2"
              >
                <Image src="/icons/icon-192.png" alt="Sinlab Study" width={24} height={24} />
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
              feedbackEnabled={feedbackEnabled}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="hidden sm:flex print:hidden! h-screen w-64 flex-col fixed left-0 top-0 border-r border-sidebar-border bg-sidebar">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <Link href="/" className="text-xl font-bold flex items-center gap-2">
            <Image src="/icons/icon-192.png" alt="Sinlab Study" width={28} height={28} />
            Sinlab Study
          </Link>
        </div>
        <div className="flex flex-col flex-1 pt-2">
          <SideNavSidebarContent
            navItems={navItems}
            pathname={pathname}
            onSignOut={handleSignOut}
            feedbackEnabled={feedbackEnabled}
          />
        </div>
      </div>
    </>
  );
}

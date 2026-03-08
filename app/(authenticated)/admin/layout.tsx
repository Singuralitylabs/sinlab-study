import {
  BookOpen,
  Calendar,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkAdminPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Separator } from "@/components/ui/separator";

const ADMIN_NAV_ITEMS = [
  { title: "ダッシュボード", href: "/admin", icon: LayoutDashboard },
  { title: "テーマ管理", href: "/admin/themes", icon: FolderOpen },
  { title: "フェーズ管理", href: "/admin/phases", icon: BookOpen },
  { title: "週管理", href: "/admin/weeks", icon: Calendar },
  { title: "コンテンツ管理", href: "/manage/contents", icon: FileText },
  { title: "受講生進捗", href: "/admin/students", icon: Users },
  { title: "提出一覧", href: "/admin/submissions", icon: ClipboardList },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userRole } = await getServerAuth();

  if (!userRole || !checkAdminPermissions(userRole)) {
    redirect("/");
  }

  return (
    <div>
      {/* 管理画面ナビゲーション */}
      <nav className="mb-6 overflow-x-auto">
        <div className="flex gap-1 pb-2">
          {ADMIN_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          ))}
        </div>
        <Separator />
      </nav>

      {children}
    </div>
  );
}

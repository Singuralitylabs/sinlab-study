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
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Separator } from "@/components/ui/separator";

const MANAGE_NAV_ITEMS = [
  { title: "ダッシュボード", href: "/manage", icon: LayoutDashboard },
  { title: "テーマ管理", href: "/manage/themes", icon: FolderOpen },
  { title: "フェーズ管理", href: "/manage/phases", icon: BookOpen },
  { title: "週管理", href: "/manage/weeks", icon: Calendar },
  { title: "コンテンツ管理", href: "/manage/contents", icon: FileText },
  { title: "受講生進捗", href: "/manage/students", icon: Users },
  { title: "提出一覧", href: "/manage/submissions", icon: ClipboardList },
];

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const { userRole } = await getServerAuth();

  if (!userRole || !checkContentPermissions(userRole)) {
    redirect("/");
  }

  return (
    <div>
      <nav className="mb-6 overflow-x-auto">
        <div className="flex gap-1 pb-2">
          {MANAGE_NAV_ITEMS.map((item) => (
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

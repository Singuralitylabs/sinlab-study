import { ClipboardList, FileText, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkInstructorPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Separator } from "@/components/ui/separator";

const INSTRUCTOR_NAV_ITEMS = [
  { title: "ダッシュボード", href: "/instructor", icon: LayoutDashboard },
  { title: "コンテンツ管理", href: "/manage/contents", icon: FileText },
  { title: "提出一覧", href: "/instructor/submissions", icon: ClipboardList },
];

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const { userRole } = await getServerAuth();

  if (!checkInstructorPermissions(userRole)) {
    redirect("/");
  }

  return (
    <div>
      {/* 講師画面ナビゲーション */}
      <nav className="mb-6 overflow-x-auto">
        <div className="flex gap-1 pb-2">
          {INSTRUCTOR_NAV_ITEMS.map((item) => (
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

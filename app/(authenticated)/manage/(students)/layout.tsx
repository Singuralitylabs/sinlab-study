import { ClipboardList, LayoutDashboard, Megaphone, MessageSquare, Users } from "lucide-react";
import { checkAdminPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { ManageGroupNav } from "../components/ManageGroupNav";

export default async function ManageStudentsGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userRole } = await getServerAuth();
  const isAdmin = checkAdminPermissions(userRole);

  const items = [
    {
      title: "ダッシュボード",
      href: "/manage",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      title: "提出一覧",
      href: "/manage/submissions",
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      title: "フィードバック",
      href: "/manage/feedbacks",
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      title: "お知らせ",
      href: "/manage/announcements",
      icon: <Megaphone className="h-4 w-4" />,
    },
    ...(isAdmin
      ? [
          {
            title: "受講生進捗",
            href: "/manage/students",
            icon: <Users className="h-4 w-4" />,
          },
        ]
      : []),
  ];

  return (
    <div>
      <ManageGroupNav items={items} />
      {children}
    </div>
  );
}

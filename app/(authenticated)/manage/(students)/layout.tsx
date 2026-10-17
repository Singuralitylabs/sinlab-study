import { ClipboardList, LayoutDashboard, MessageSquare, Users } from "lucide-react";
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
    { title: "ダッシュボード", href: "/manage", icon: LayoutDashboard },
    { title: "提出一覧", href: "/manage/submissions", icon: ClipboardList },
    { title: "フィードバック", href: "/manage/feedbacks", icon: MessageSquare },
    ...(isAdmin ? [{ title: "受講生進捗", href: "/manage/students", icon: Users }] : []),
  ];

  return (
    <div>
      <ManageGroupNav items={items} />
      {children}
    </div>
  );
}

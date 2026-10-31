import { ClipboardList, FileText, LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";
import { checkInstructorPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { ManageGroupNav } from "../manage/components/ManageGroupNav";

/** Legacy /instructor chrome; pages redirect into /manage (#335). */
const INSTRUCTOR_NAV_ITEMS = [
  {
    title: "受講生管理",
    href: "/manage",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    title: "コンテンツ管理",
    href: "/manage/contents",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    title: "提出一覧",
    href: "/manage/submissions",
    icon: <ClipboardList className="h-4 w-4" />,
  },
];

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const { userRole } = await getServerAuth();

  if (!checkInstructorPermissions(userRole)) {
    redirect("/");
  }

  return (
    <div>
      <ManageGroupNav items={INSTRUCTOR_NAV_ITEMS} />
      {children}
    </div>
  );
}

import { redirect } from "next/navigation";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

/** Auth gate only. Group tabs live in (content) / (students) layouts (#335). */
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const { userRole } = await getServerAuth();

  if (!checkContentPermissions(userRole)) {
    redirect("/");
  }

  return <div>{children}</div>;
}

import { redirect } from "next/navigation";

/** List UI merged into the content tree (#335). */
export default function ManagePhasesRedirectPage() {
  redirect("/manage/contents");
}

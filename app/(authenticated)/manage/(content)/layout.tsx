import { FileText, Megaphone } from "lucide-react";
import { ManageGroupNav } from "../components/ManageGroupNav";

const CONTENT_NAV_ITEMS = [
  { title: "構成ツリー", href: "/manage/contents", icon: FileText },
  { title: "お知らせ", href: "/manage/announcements", icon: Megaphone },
];

export default function ManageContentGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ManageGroupNav items={CONTENT_NAV_ITEMS} />
      {children}
    </div>
  );
}

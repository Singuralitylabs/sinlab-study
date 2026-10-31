import { FileText, ListFilter } from "lucide-react";
import {
  MANAGE_CONTENTS_BULK_PATH,
  MANAGE_CONTENTS_TREE_PATH,
} from "@/app/lib/manage-contents-paths";
import { ManageGroupNav } from "../components/ManageGroupNav";

const CONTENT_NAV_ITEMS = [
  {
    title: "構成ツリー",
    href: MANAGE_CONTENTS_TREE_PATH,
    icon: <FileText className="h-4 w-4" />,
  },
  {
    title: "コンテンツ一括操作",
    href: MANAGE_CONTENTS_BULK_PATH,
    icon: <ListFilter className="h-4 w-4" />,
  },
];

export default function ManageContentGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ManageGroupNav items={CONTENT_NAV_ITEMS} />
      {children}
    </div>
  );
}

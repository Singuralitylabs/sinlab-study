import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { PLAYGROUND_NAV_TITLE } from "@/app/constants/playground";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { PlaygroundWorkspace } from "./components/PlaygroundWorkspace";

export default async function PlaygroundPage() {
  // proxy.ts and the (authenticated) layout already allow only active / trial here.
  const { userId } = await getServerAuth();
  if (!userId) {
    notFound();
  }
  return (
    <div className="max-w-7xl mx-auto">
      <PageTitle
        title={PLAYGROUND_NAV_TITLE}
        description="講座とは別に、HTML・CSS・JavaScript、Python、SQL を自由に書いて動かせます。"
      />
      <PlaygroundWorkspace userId={userId} />
    </div>
  );
}

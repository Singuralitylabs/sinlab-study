import { NextResponse } from "next/server";
import { AI_CHAT_DISABLED_MESSAGE, isAiChatEnabled } from "@/app/constants/ai-chat";
import { fetchAIChatUsageSummary } from "@/app/services/api/ai-chat-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

/** Remaining questions and when they reset. There is no conversation API: chats are not stored. */
export async function GET() {
  try {
    if (!isAiChatEnabled()) {
      return NextResponse.json({ error: AI_CHAT_DISABLED_MESSAGE }, { status: 503 });
    }
    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId, userStatus } = guard.auth;

    const supabase = await createServerSupabaseClient();
    const { data, error } = await fetchAIChatUsageSummary(supabase, userId, userStatus, new Date());
    if (error || !data) {
      return NextResponse.json({ error: "相談回数の取得に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ usage: data });
  } catch (error) {
    console.error("AIチャット利用状況APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

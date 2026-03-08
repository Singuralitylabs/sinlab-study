import { type NextRequest, NextResponse } from "next/server";
import { createContent } from "@/app/services/api/admin-server";
import { getApiAuth, getApiSupabaseClient } from "@/app/services/auth/api-auth";
import { checkContentPermissions } from "@/app/services/auth/permissions";

export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = await getApiSupabaseClient();
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", auth.data.userId)
      .single();

    if (!userData || !checkContentPermissions(userData.role)) {
      return NextResponse.json({ error: "コンテンツ管理権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const { title, week_id, content_type, video_url, text_content, exercise_instructions, pdf_url, display_order, is_published } = body;

    if (!title || !week_id || !content_type) {
      return NextResponse.json({ error: "必須パラメータが不足しています" }, { status: 400 });
    }

    const { data, error } = await createContent({
      title,
      week_id,
      content_type,
      video_url,
      text_content,
      exercise_instructions,
      pdf_url,
      display_order,
      is_published,
    });

    if (error) {
      return NextResponse.json({ error: "コンテンツの作成に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, content: data });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

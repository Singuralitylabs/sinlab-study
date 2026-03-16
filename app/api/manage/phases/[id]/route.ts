import { type NextRequest, NextResponse } from "next/server";
import { updatePhase } from "@/app/services/api/admin-server";
import { getApiAuth, getApiSupabaseClient } from "@/app/services/auth/api-auth";
import { checkContentPermissions } from "@/app/services/auth/permissions";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json({ error: "管理権限がありません" }, { status: 403 });
    }
    const { id } = await params;
    const phaseId = Number.parseInt(id, 10);
    if (Number.isNaN(phaseId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }
    const body = await request.json();
    const { theme_id, name, description, display_order, is_published } = body;
    const { error } = await updatePhase(phaseId, {
      theme_id,
      name,
      description,
      display_order,
      is_published,
    });
    if (error) {
      return NextResponse.json({ error: "フェーズの更新に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

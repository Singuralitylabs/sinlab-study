import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { createTheme } from "@/app/services/api/admin-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST(request: NextRequest) {
  try {
    const { user, userId, userStatus, userRole } = await getServerAuth();
    if (!user || !userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    if (!checkContentPermissions(userRole)) {
      return NextResponse.json({ error: "管理権限がありません" }, { status: 403 });
    }
    const body = await request.json();
    const { name, description, display_order, is_published, image_url } = body;
    if (!name) {
      return NextResponse.json({ error: "テーマ名は必須です" }, { status: 400 });
    }
    const { data, error } = await createTheme({
      name,
      description,
      display_order,
      is_published,
      image_url,
    });
    if (error) {
      return NextResponse.json({ error: "テーマの作成に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true, theme: data });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

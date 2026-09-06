import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
import { createWeek } from "@/app/services/api/admin-server";
import { validateRequest, WeekCreateSchema } from "@/app/services/api/schemas";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST(request: NextRequest) {
  try {
    const { user, userId, userStatus, userRole } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    if (!checkContentPermissions(userRole)) {
      return NextResponse.json({ error: "管理権限がありません" }, { status: 403 });
    }

    const validation = await validateRequest(request, WeekCreateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { phase_id, name, description, insert_after_id, is_published } = validation.data;

    const { data, error } = await createWeek({
      phase_id,
      name,
      description,
      insertAfterId: insert_after_id,
      is_published,
    });
    if (error) {
      return NextResponse.json({ error: "週の作成に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true, week: data });
  } catch (error) {
    if (error instanceof InvalidInsertAfterIdError) {
      console.error("週作成エラー（insert_after_id不正）:", error.insertAfterId);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { parseBulkImportCsv, validateBulkImportRows } from "@/app/lib/bulk-content-import";
import { importBulkContents } from "@/app/services/api/content-import-server";
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
      return NextResponse.json({ error: "コンテンツ管理権限がありません" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSVファイルが見つかりません" }, { status: 400 });
    }

    const csvText = await file.text();
    const { rows, errors: parseErrors } = parseBulkImportCsv(csvText);
    if (parseErrors.length > 0) {
      return NextResponse.json({ error: parseErrors[0].message }, { status: 400 });
    }

    const { validRows, errors: validationErrors } = validateBulkImportRows(rows);
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors[0].message }, { status: 400 });
    }

    const result = await importBulkContents(validRows);
    if (!result.success) {
      return NextResponse.json(
        { error: result.errors[0] || "一括取り込みに失敗しました" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, createdCount: result.createdCount });
  } catch (error) {
    console.error("一括取り込みAPI エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { parseBulkImportCsv, validateBulkImportRows } from "@/app/lib/bulk-content-import";
import { importBulkContents } from "@/app/services/api/content-import-server";
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

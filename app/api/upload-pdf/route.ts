import { type NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getApiAuth, getApiSupabaseClient } from "@/app/services/auth/api-auth";
import { checkContentPermissions } from "@/app/services/auth/permissions";

const BUCKET_NAME = "slides";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // admin または maintainer（講師）のみアップロード可能
    const supabaseForRole = await getApiSupabaseClient();
    const { data: userData } = await supabaseForRole
      .from("users")
      .select("role")
      .eq("id", auth.data.userId)
      .single();

    if (!userData || !checkContentPermissions(userData.role)) {
      return NextResponse.json({ error: "アップロード権限がありません" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "PDFファイルのみアップロード可能です" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズは50MB以下にしてください" },
        { status: 400 }
      );
    }

    const supabase = await createAdminSupabaseClient();

    // ユニークなファイル名を生成
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${timestamp}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("PDFアップロードエラー:", uploadError);
      return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

const BUCKET_NAME = "slides";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// フォルダ名（コーススラッグ）は英小文字・数字・ハイフンのみ許可
const FOLDER_PATTERN = /^[a-z0-9-]+$/;
// 命名規約に沿ったスライドファイル名（slide-NN.pdf）
const SLIDE_FILE_PATTERN = /^slide-(\d+)\.pdf$/;

/**
 * 指定フォルダ内の既存 slide-NN.pdf を走査し、次に使う連番（最大値+1）を返す。
 * 既存が無ければ 1 を返す。
 * 一覧取得に失敗した場合は走査失敗を区別できないため例外を投げる
 * （誤った自動採番で既存ファイルを上書き／409誤判定するのを防ぐ）。
 */
async function getNextSlideNumber(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  folder: string
): Promise<number> {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list(folder, { limit: 1000 });

  if (error || !data) {
    throw new Error(`スライド一覧の取得に失敗しました: ${error?.message ?? "unknown error"}`);
  }

  let maxNumber = 0;
  for (const item of data) {
    const match = item.name.match(SLIDE_FILE_PATTERN);
    if (match) {
      maxNumber = Math.max(maxNumber, Number.parseInt(match[1], 10));
    }
  }

  return maxNumber + 1;
}

export async function POST(request: NextRequest) {
  try {
    const { user, userId, userStatus, userRole } = await getServerAuth();
    if (!user || !userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

    // admin または maintainer（講師）のみアップロード可能
    if (!checkContentPermissions(userRole)) {
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

    // 保存先フォルダ（コーススラッグ）とスライド番号を取得
    const folderRaw = (formData.get("folder") as string | null)?.trim() ?? "";
    const slideNumberRaw = (formData.get("slideNumber") as string | null)?.trim() ?? "";

    let filePath: string;
    // フォルダ指定時は命名規約 slides/<folder>/slide-NN.pdf に沿って保存
    let allowOverwrite = false;

    if (folderRaw) {
      const folder = folderRaw.toLowerCase();
      if (!FOLDER_PATTERN.test(folder)) {
        return NextResponse.json(
          { error: "フォルダ名は英小文字・数字・ハイフンのみ使用できます" },
          { status: 400 }
        );
      }

      let slideNumber: number;
      if (slideNumberRaw) {
        // 番号指定時：その番号で保存（既存ファイルは上書き）
        const parsed = Number.parseInt(slideNumberRaw, 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return NextResponse.json(
            { error: "スライド番号は1以上の整数を指定してください" },
            { status: 400 }
          );
        }
        slideNumber = parsed;
        allowOverwrite = true;
      } else {
        // 番号未指定時：同フォルダ内の既存連番から自動採番
        try {
          slideNumber = await getNextSlideNumber(supabase, folder);
        } catch (listError) {
          console.error("スライド一覧取得エラー:", listError);
          return NextResponse.json(
            { error: "スライド一覧の取得に失敗しました。時間をおいて再度お試しください" },
            { status: 500 }
          );
        }
      }

      const paddedNumber = String(slideNumber).padStart(2, "0");
      filePath = `${folder}/slide-${paddedNumber}.pdf`;
    } else {
      // フォルダ未指定時は従来のタイムスタンプ付きファイル名（後方互換）
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      filePath = `${timestamp}_${safeName}`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: allowOverwrite,
      });

    if (uploadError) {
      console.error("PDFアップロードエラー:", uploadError);
      // 自動採番中に同名ファイルが存在した場合（409 Conflict）はその旨を明示
      const isDuplicate = uploadError.status === 409 || uploadError.statusCode === "Duplicate";
      const message = isDuplicate
        ? "同じ番号のスライドが既に存在します。番号を指定して上書きしてください"
        : "アップロードに失敗しました";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl, path: filePath });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

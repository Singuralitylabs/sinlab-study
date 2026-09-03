import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

const BUCKET_NAME = "slides";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// フォルダ名（コーススラッグ）は英小文字・数字・ハイフンのみ許可
const FOLDER_PATTERN = /^[a-z0-9-]+$/;
// 命名規約に沿ったスライドファイル名（slide-NN.pdf）
const SLIDE_FILE_PATTERN = /^slide-(\d+)\.pdf$/;

type AdminSupabaseClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

/** 自動採番できる番号が安全な整数の範囲を超えたことを示す（一覧取得の失敗と区別する） */
class SlideNumberExhaustedError extends Error {}

/**
 * アップロード直後に対象オブジェクトの実体を照合する。
 *
 * getPublicUrl() はパスを文字列連結するだけで存在を保証しないため、
 * 「成功したのに実体が無い」URLが learning_contents.pdf_url に保存されるのを防ぐ防波堤。
 * 照合できない場合は必ず例外を投げる（呼び出し側は成功として扱ってはならない）。
 *
 * 照合に失敗してもアップロード済みオブジェクトの削除は行わない
 * （失敗原因が一時的な通信エラーだった場合、正常なファイルを消してしまうため）。
 * 番号未指定で再アップロードすると残ったファイルの次の番号が採番されるため、
 * 409にはならず「どこからも参照されない孤児ファイルと欠番」が残る。
 */
async function verifyUploadedObject(
  supabase: AdminSupabaseClient,
  uploadData: { path: string; fullPath: string } | null,
  expectedPath: string
): Promise<void> {
  // storage-js はエラー無しでも data を null にし得る
  if (!uploadData) {
    throw new Error("アップロード結果が空です");
  }

  // data.path は storage-js が引数のパスから組み立てて返すだけで検証の役に立たない。
  // サーバー応答（data.Key）由来の fullPath で、実際の保存先を確かめる
  const expectedFullPath = `${BUCKET_NAME}/${expectedPath}`;
  if (uploadData.fullPath !== expectedFullPath) {
    throw new Error(
      `アップロード先が想定と異なります: expected=${expectedFullPath}, actual=${uploadData.fullPath}`
    );
  }

  // exists() は対象キーへのHEAD。list({ search }) と違い部分一致も件数上限も無いため、
  // 存在するのに見つけられない窓が無い。400/404 は data:false、それ以外の失敗は例外になる
  const { data: exists } = await supabase.storage.from(BUCKET_NAME).exists(expectedPath);
  if (!exists) {
    throw new Error(`アップロードしたオブジェクトが見つかりません: ${expectedPath}`);
  }
}

/**
 * 確定済みのオブジェクトキーから配信URLを組み立てる。
 * 存在確認（verifyUploadedObject）がキーだけを扱うため、配信方式の変更はこの関数に閉じる。
 * #89 で createSignedUrl() へ移行する際は、この関数が非同期になり失敗分岐が1つ増える。
 */
function buildSlideDeliveryUrl(supabase: AdminSupabaseClient, objectKey: string): string {
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectKey);
  return data.publicUrl;
}

/**
 * 指定フォルダ内の既存 slide-NN.pdf を走査し、次に使う連番（最大値+1）を返す。
 * 既存が無ければ 1 を返す。
 * 一覧取得に失敗した場合は走査失敗を区別できないため例外を投げる
 * （誤った自動採番で既存ファイルを上書き／409誤判定するのを防ぐ）。
 */
async function getNextSlideNumber(supabase: AdminSupabaseClient, folder: string): Promise<number> {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list(folder, { limit: 1000 });

  if (error || !data) {
    throw new Error(`スライド一覧の取得に失敗しました: ${error?.message ?? "unknown error"}`);
  }

  let maxNumber = 0;
  for (const item of data) {
    const match = item.name.match(SLIDE_FILE_PATTERN);
    if (!match) {
      continue;
    }
    // 番号指定時と同じ基準で解釈する（桁あふれしたファイル名は採番の基準にしない）
    const existingNumber = parsePositiveInteger(match[1]);
    if (existingNumber !== null) {
      maxNumber = Math.max(maxNumber, existingNumber);
    }
  }

  const nextNumber = maxNumber + 1;
  // 採番した番号自体が安全な整数でないと、次回の走査でそのファイルを読み飛ばして
  // 同じ番号を採番し続ける（409で永久に失敗する）ため、増やす前に枯渇を検出する
  if (!Number.isSafeInteger(nextNumber)) {
    throw new SlideNumberExhaustedError("自動採番できる番号の上限に達しました");
  }

  return nextNumber;
}

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
    // FormData には File が入り得るため、文字列以外は不正入力として扱う
    const folderValue = formData.get("folder");
    if (folderValue !== null && typeof folderValue !== "string") {
      return NextResponse.json(
        { error: "フォルダ名は英小文字・数字・ハイフンのみ使用できます" },
        { status: 400 }
      );
    }
    const folderRaw = folderValue?.trim() ?? "";
    // スライド番号は前後の空白も不正入力として扱うため trim しない
    const slideNumberValue = formData.get("slideNumber");

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
      // 未指定（フィールド自体が無い）だけを自動採番の対象とし、空文字は不正入力として扱う
      if (slideNumberValue !== null) {
        // 番号指定時：その番号で保存（既存ファイルは上書き）
        const parsed = parsePositiveInteger(slideNumberValue);
        if (parsed === null) {
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
          if (listError instanceof SlideNumberExhaustedError) {
            return NextResponse.json(
              { error: "自動採番できる番号の上限に達しました。スライド番号を指定してください" },
              { status: 400 }
            );
          }
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

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: allowOverwrite,
      });

    if (uploadError) {
      console.error("PDFアップロードエラー:", uploadError);
      // 自動採番中に同名ファイルが存在した場合（409 Conflict）はその旨を明示。
      // storage-js は statusCode をレスポンスボディの statusCode / code、無ければ
      // HTTPステータス文字列から組み立てるため、"Duplicate" ではなく "409" になる
      const isDuplicate = uploadError.status === 409 || uploadError.statusCode === "409";
      const message = isDuplicate
        ? "同じ番号のスライドが既に存在します。番号を指定して上書きしてください"
        : "アップロードに失敗しました";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // 実体を確認できるまでURLを返さない（不正な pdf_url がコンテンツに保存されるのを防ぐ）
    try {
      await verifyUploadedObject(supabase, uploadData, filePath);
    } catch (verificationError) {
      console.error("PDFアップロードの存在確認エラー:", verificationError);
      // 消費したキーを伝える（自動採番ではこの番号が孤児として残り、再試行では次の番号になる）
      return NextResponse.json(
        {
          error: `アップロードの完了を確認できませんでした（${filePath}）。時間をおいて再度お試しください`,
          path: filePath,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: buildSlideDeliveryUrl(supabase, filePath), path: filePath });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

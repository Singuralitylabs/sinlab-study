import { type NextRequest, NextResponse } from "next/server";
import { SLIDE_NUMBER_MAX } from "@/app/constants/slides";
import { SLIDES_BUCKET } from "@/app/constants/storage";
import { USER_STATUS } from "@/app/constants/user";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import {
  buildSlideObjectKey,
  SLIDE_FILE_NAME_PATTERN,
  SLIDE_FOLDER_PATTERN,
} from "@/app/lib/slide-object-key";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

const BUCKET_NAME = SLIDES_BUCKET;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

type AdminSupabaseClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

/** Auto-numbering exceeded the domain maximum; distinct from a listing failure. */
class SlideNumberExhaustedError extends Error {}

function invalidSlideNumberMessage(): string {
  return `スライド番号は1以上${SLIDE_NUMBER_MAX}以下の整数を指定してください`;
}

function slideNumberExhaustedMessage(): string {
  return `自動採番できる番号の上限（${SLIDE_NUMBER_MAX}）に達しました。スライド番号を指定してください`;
}

/**
 * Verify the object exists right after upload: upload()'s return value doesn't guarantee it, and
 * this keeps a pdf_url key with no object from being saved. Must throw when verification isn't
 * possible (callers must not treat that as success). The uploaded object is not deleted on failure,
 * since a transient network error would remove a good file. A retry without a number picks the next
 * number, leaving an orphan file and a numbering gap instead of a 409.
 */
async function verifyUploadedObject(
  supabase: AdminSupabaseClient,
  uploadData: { path: string; fullPath: string } | null,
  expectedPath: string
): Promise<void> {
  // storage-js can return null data without an error.
  if (!uploadData) {
    throw new Error("アップロード結果が空です");
  }

  // data.path is just built from the argument path and proves nothing. Check the actual location
  // via fullPath (from the server response, data.Key).
  const expectedFullPath = `${BUCKET_NAME}/${expectedPath}`;
  if (uploadData.fullPath !== expectedFullPath) {
    throw new Error(
      `アップロード先が想定と異なります: expected=${expectedFullPath}, actual=${uploadData.fullPath}`
    );
  }

  // exists() is a HEAD on the exact key: unlike list({ search }) it has no partial matching or
  // result cap, so there is no window where an existing object isn't found. 400/404 give
  // data:false; other failures throw.
  const { data: exists } = await supabase.storage.from(BUCKET_NAME).exists(expectedPath);
  if (!exists) {
    throw new Error(`アップロードしたオブジェクトが見つかりません: ${expectedPath}`);
  }
}

/**
 * Returns the max existing slide-NN number + 1 (1 if none). Throws if listing fails: a wrong
 * auto-number could overwrite an existing file or misreport a 409.
 */
async function getNextSlideNumber(supabase: AdminSupabaseClient, folder: string): Promise<number> {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list(folder, { limit: 1000 });

  if (error || !data) {
    throw new Error(`スライド一覧の取得に失敗しました: ${error?.message ?? "unknown error"}`);
  }

  let maxNumber = 0;
  for (const item of data) {
    const match = item.name.match(SLIDE_FILE_NAME_PATTERN);
    if (!match) {
      continue;
    }
    // Same parsing as explicit numbers (ignore over-limit/overflowing file names).
    const existingNumber = parsePositiveInteger(match[1]);
    if (existingNumber !== null && existingNumber <= SLIDE_NUMBER_MAX) {
      maxNumber = Math.max(maxNumber, existingNumber);
    }
  }

  const nextNumber = maxNumber + 1;
  // Past SLIDE_NUMBER_MAX the next scan would keep picking the same number and 409 forever, so
  // detect exhaustion before incrementing. The max is far below the safe-integer limit, so this
  // also covers that check.
  if (nextNumber > SLIDE_NUMBER_MAX || !Number.isSafeInteger(nextNumber)) {
    throw new SlideNumberExhaustedError(slideNumberExhaustedMessage());
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

    // FormData may contain a File, so non-string values are invalid input.
    const folderValue = formData.get("folder");
    if (folderValue !== null && typeof folderValue !== "string") {
      return NextResponse.json(
        { error: "フォルダ名は英小文字・数字・ハイフンのみ使用できます" },
        { status: 400 }
      );
    }
    const folderRaw = folderValue?.trim() ?? "";
    // Do not trim: surrounding whitespace is invalid input.
    const slideNumberValue = formData.get("slideNumber");

    let filePath: string;
    let allowOverwrite = false;

    if (folderRaw) {
      const folder = folderRaw.toLowerCase();
      if (!SLIDE_FOLDER_PATTERN.test(folder)) {
        return NextResponse.json(
          { error: "フォルダ名は英小文字・数字・ハイフンのみ使用できます" },
          { status: 400 }
        );
      }

      let slideNumber: number;
      // Only an absent field triggers auto-numbering; an empty string is invalid.
      if (slideNumberValue !== null) {
        // Explicit number: overwrite the existing file. parsePositiveInteger() is generic with no
        // upper bound; the domain cap (SLIDE_NUMBER_MAX) is checked on the slide-number side.
        const parsed = parsePositiveInteger(slideNumberValue);
        if (parsed === null || parsed > SLIDE_NUMBER_MAX) {
          return NextResponse.json({ error: invalidSlideNumberMessage() }, { status: 400 });
        }
        slideNumber = parsed;
        allowOverwrite = true;
      } else {
        try {
          slideNumber = await getNextSlideNumber(supabase, folder);
        } catch (listError) {
          if (listError instanceof SlideNumberExhaustedError) {
            return NextResponse.json({ error: slideNumberExhaustedMessage() }, { status: 400 });
          }
          console.error("スライド一覧取得エラー:", listError);
          return NextResponse.json(
            { error: "スライド一覧の取得に失敗しました。時間をおいて再度お試しください" },
            { status: 500 }
          );
        }
      }

      filePath = buildSlideObjectKey(folder, slideNumber);
    } else {
      // No folder: legacy timestamped file name (backward compatibility).
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
      // storage-js derives statusCode from the response body's statusCode/code or the HTTP status
      // string, so a duplicate shows up as "409", not "Duplicate".
      const isDuplicate = uploadError.status === 409 || uploadError.statusCode === "409";
      const message = isDuplicate
        ? "同じ番号のスライドが既に存在します。番号を指定して上書きしてください"
        : "アップロードに失敗しました";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // Don't return the key until the object is confirmed, so an invalid pdf_url can't be saved.
    try {
      await verifyUploadedObject(supabase, uploadData, filePath);
    } catch (verificationError) {
      console.error("PDFアップロードの存在確認エラー:", verificationError);
      // Report the consumed key (with auto-numbering that number stays orphaned; a retry gets the
      // next one).
      return NextResponse.json(
        {
          error: `アップロードの完了を確認できませんでした（${filePath}）。時間をおいて再度お試しください`,
          path: filePath,
        },
        { status: 500 }
      );
    }

    // Only the object key is stored (#89); signed URLs are issued server-side at view time, so no
    // URL is returned.
    return NextResponse.json({ path: filePath });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

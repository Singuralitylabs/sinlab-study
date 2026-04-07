import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "このデモ用AIレビューAPIは無効化されています。本番の認証付きエンドポイントをご利用ください。",
    },
    { status: 403 }
  );
}

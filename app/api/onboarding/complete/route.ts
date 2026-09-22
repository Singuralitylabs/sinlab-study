import { NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { markOnboardingCompleted } from "@/app/services/api/onboarding-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST() {
  try {
    const { user, userId, userStatus } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (userId == null) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

    // role が member 以外でも成功扱いにする（呼ばれない前提だが拒否する理由は無い）
    const { error } = await markOnboardingCompleted(userId);
    if (error) {
      return NextResponse.json(
        { error: "オンボーディングの完了記録に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

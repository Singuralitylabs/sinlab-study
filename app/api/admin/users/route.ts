import { NextResponse } from "next/server";
import { MEMBERSHIP_TYPES, USER_ROLE, USER_ROLES, USER_STATUS } from "@/app/constants/user";
import {
  approveUser,
  changeMembershipType,
  changeUserRole,
  fetchUserIdsWithStripeSubscription,
  rejectUser,
} from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function PATCH(request: Request) {
  try {
    const auth = await getServerAuth();
    if (!auth.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    // 却下済みユーザーはAuthセッションが有効な間もアクセス不可とする
    // （却下前に admin/maintainer だった場合、role 自体は却下時にクリアされないため
    // ロールチェックだけでは弾けない。他の管理系APIと同じステータスゲート）
    if (auth.userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    // 管理者権限チェック
    if (auth.userRole !== USER_ROLE.ADMIN) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, action, role, membershipType } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: "userId と action は必須です" }, { status: 400 });
    }

    if (
      action !== "approve" &&
      action !== "reject" &&
      action !== "change_role" &&
      action !== "change_membership"
    ) {
      return NextResponse.json(
        {
          error: "action は approve / reject / change_role / change_membership を指定してください",
        },
        { status: 400 }
      );
    }

    if (action === "change_membership") {
      if (!MEMBERSHIP_TYPES.includes(membershipType)) {
        return NextResponse.json(
          { error: `membershipType は ${MEMBERSHIP_TYPES.join(" / ")} を指定してください` },
          { status: 400 }
        );
      }

      // Stripe契約中ユーザーは、種別変更でmembership_typeと課金状態が食い違うのを防ぐため
      // Stripe側で解約するまで変更不可とする（着手前提の決定）。取得に失敗した場合は
      // 契約状況を判定できないためフェイルクローズで変更不可とする。
      const { data: subscribedUserIds, error: subscriptionsError } =
        await fetchUserIdsWithStripeSubscription();
      if (subscriptionsError) {
        return NextResponse.json(
          {
            error:
              "Stripe契約状況を取得できなかったため会員種別を変更できません。時間をおいて再度お試しください",
          },
          { status: 503 }
        );
      }
      if ((subscribedUserIds ?? []).includes(userId)) {
        return NextResponse.json(
          {
            error:
              "このユーザーはStripeサブスク契約中のため会員種別を変更できません。Stripe側で解約してから変更してください",
          },
          { status: 409 }
        );
      }

      const { error, updated } = await changeMembershipType(userId, membershipType);
      if (error) {
        return NextResponse.json({ error: "会員種別更新に失敗しました" }, { status: 500 });
      }
      // 0行更新 = 対象が active以外・存在しない・削除済みのいずれか
      if (!updated) {
        return NextResponse.json(
          {
            error:
              "会員種別を変更できません（active以外のユーザーか、存在しません）。画面を更新して最新の状態を確認してください",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, action });
    }

    if (action === "change_role") {
      if (!role || !USER_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `role は ${USER_ROLES.join(" / ")} を指定してください` },
          { status: 400 }
        );
      }

      const { error, updated } = await changeUserRole(userId, role);
      if (error) {
        return NextResponse.json({ error: "ロール更新に失敗しました" }, { status: 500 });
      }
      // 0行更新 = 対象が admin（降格・誤操作防止のため変更不可）・active以外・存在しない・削除済みのいずれか
      if (!updated) {
        return NextResponse.json(
          {
            error:
              "ロールを変更できません（管理者ユーザーか、active以外のユーザーか、存在しません）",
          },
          { status: 403 }
        );
      }
      return NextResponse.json({ success: true, action });
    }

    // 承認時は会員種別（コミュニティ会員 / 一般有料会員）の指定を必須とする
    if (action === "approve" && !MEMBERSHIP_TYPES.includes(membershipType)) {
      return NextResponse.json(
        { error: `membershipType は ${MEMBERSHIP_TYPES.join(" / ")} を指定してください` },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const { error, updated } = await approveUser(userId, membershipType);
      if (error) {
        return NextResponse.json({ error: "ステータス更新に失敗しました" }, { status: 500 });
      }
      // 0行更新 = 既に承認済み（再承認による会員種別の意図しない上書きを防止。種別変更は change_membership で行う）、
      // または存在しない・削除済みユーザー
      if (!updated) {
        return NextResponse.json(
          {
            error:
              "このユーザーは承認できません（承認済みか、存在しません）。画面を更新して最新の状態を確認してください",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, action });
    }

    const { error, updated } = await rejectUser(userId);
    if (error) {
      return NextResponse.json({ error: "ステータス更新に失敗しました" }, { status: 500 });
    }
    // 0行更新 = 対象が admin（change_role と同様の保護のため却下不可）、または存在しない・削除済みユーザー
    if (!updated) {
      return NextResponse.json(
        { error: "却下できません（管理者ユーザーか、存在しません）" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("ユーザー管理APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

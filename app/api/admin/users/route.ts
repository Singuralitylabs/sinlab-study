import { NextResponse } from "next/server";
import { USER_MEMBERSHIP, USER_ROLE, USER_STATUS } from "@/app/constants/user";
import {
  approveUser,
  changeMembershipType,
  changeUserRole,
  isUserCurrentlySubscribed,
  rejectUser,
} from "@/app/services/api/admin-server";
import { AdminUserActionSchema, validateRequest } from "@/app/services/api/schemas";
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

    const validation = await validateRequest(request, AdminUserActionSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { data } = validation;
    const { userId, action } = data;

    // Stripe契約中ユーザーは、membership_typeと課金状態が食い違わないよう一般有料会員以外への
    // 設定を拒否する（着手前提の決定）。承認・会員種別変更の両アクションに共通のルールとする
    // （承認時にだけガードを外すと、契約中ユーザーをコミュニティ会員として承認した後に
    // change_membership でも一般有料会員へ直せない、という詰みを生むため）。
    //
    // 取得失敗時の扱いはアクションごとに非対称:
    // - change_membership はStripe整合性の保護そのものが目的のため、判定できない場合は
    //   フェイルクローズで拒否する
    // - approve は主目的がお試しユーザーの承認であり対象の大半はStripe非契約のため、
    //   Stripe側の一時的な取得失敗で承認フロー全体を止めない（契約中と判定できた場合のみガードする）
    if (data.action === "approve" || data.action === "change_membership") {
      const { data: isSubscribed, error: subscriptionError } =
        await isUserCurrentlySubscribed(userId);

      if (subscriptionError) {
        if (data.action === "change_membership") {
          return NextResponse.json(
            {
              error:
                "Stripe契約状況を取得できなかったため会員種別を変更できません。時間をおいて再度お試しください",
            },
            { status: 503 }
          );
        }
      } else if (isSubscribed && data.membershipType !== USER_MEMBERSHIP.GENERAL) {
        return NextResponse.json(
          {
            error:
              "このユーザーはStripeサブスク契約中のため一般有料会員以外に設定できません。種別を変更する場合はStripe側で解約してから行ってください",
          },
          { status: 409 }
        );
      }
    }

    if (data.action === "change_membership") {
      const { error, updated } = await changeMembershipType(userId, data.membershipType);
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

    if (data.action === "change_role") {
      const { error, updated } = await changeUserRole(userId, data.role);
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

    if (data.action === "approve") {
      const { error, updated } = await approveUser(userId, data.membershipType);
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

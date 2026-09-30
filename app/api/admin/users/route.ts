import { NextResponse } from "next/server";
import { USER_MEMBERSHIP, USER_ROLE, USER_STATUS } from "@/app/constants/user";
import {
  approveUser,
  changeMembershipType,
  changeUserRole,
  isUserCurrentlySubscribed,
  rejectUser,
  setUserEmailOptOut,
} from "@/app/services/api/admin-server";
import { AdminUserActionSchema, validateRequest } from "@/app/services/api/schemas";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { scheduleApprovedEmail } from "@/app/services/notifications/user-emails";

export async function PATCH(request: Request) {
  try {
    const auth = await getServerAuth();
    if (!auth.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    // Rejected users are blocked even while their Auth session is valid. A former admin/maintainer
    // keeps their role after rejection (it isn't cleared), so a role check alone doesn't stop them;
    // same status gate as the other admin APIs.
    if (auth.userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    if (auth.userRole !== USER_ROLE.ADMIN) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const validation = await validateRequest(request, AdminUserActionSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { data } = validation;
    const { userId, action } = data;

    // Stripe-subscribed users can only be set to general so membership_type and billing don't
    // diverge. Applies to both approve and change_membership (relaxing it on approve would let a
    // subscribed user be approved as community and then be impossible to fix via
    // change_membership). Failure handling is asymmetric: change_membership exists to protect
    // Stripe consistency, so it fails closed when undecidable; approve is mainly for trial users,
    // most of whom aren't subscribed, so a transient Stripe fetch failure must not stop approval
    // (guard only when a subscription is confirmed).
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
      // 0 rows updated: target is not active, missing or deleted.
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
      // 0 rows updated: target is admin (immutable, prevents demotion mistakes), not active,
      // missing or deleted.
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

    if (data.action === "resume_email" || data.action === "opt_out_email") {
      const optOut = data.action === "opt_out_email";
      const { error, updated } = await setUserEmailOptOut(userId, optOut);
      if (error) {
        return NextResponse.json({ error: "配信停止状態の更新に失敗しました" }, { status: 500 });
      }
      // 0 rows updated: already in the requested state, missing or deleted.
      if (!updated) {
        return NextResponse.json(
          {
            error: optOut
              ? "すでに配信停止中か、ユーザーが存在しません。画面を更新して最新の状態を確認してください"
              : "配信停止中ではないか、ユーザーが存在しません。画面を更新して最新の状態を確認してください",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, action });
    }

    if (data.action === "approve") {
      const { error, updated, approvedAt } = await approveUser(userId, data.membershipType);
      if (error) {
        return NextResponse.json({ error: "ステータス更新に失敗しました" }, { status: 500 });
      }
      // 0 rows updated: already approved (prevents accidentally overwriting membership type on
      // re-approval; use change_membership for changes), or missing/deleted.
      if (!updated) {
        return NextResponse.json(
          {
            error:
              "このユーザーは承認できません（承認済みか、存在しません）。画面を更新して最新の状態を確認してください",
          },
          { status: 409 }
        );
      }
      scheduleApprovedEmail({ userId, membershipType: data.membershipType, approvedAt });
      return NextResponse.json({ success: true, action });
    }

    const { error, updated } = await rejectUser(userId);
    if (error) {
      return NextResponse.json({ error: "ステータス更新に失敗しました" }, { status: 500 });
    }
    // 0 rows updated: target is admin (same protection as change_role), or missing/deleted.
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

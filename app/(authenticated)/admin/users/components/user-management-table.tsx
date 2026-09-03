"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MEMBERSHIP_TYPES,
  USER_MEMBERSHIP,
  USER_MEMBERSHIP_LABELS,
  USER_ROLE,
  USER_STATUS,
} from "@/app/constants/user";
import type { MembershipType, UserRoleType, UserStatusType, UserType } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<
  UserStatusType,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  pending: { label: "承認待ち", variant: "secondary" },
  active: { label: "承認済み", variant: "default" },
  rejected: { label: "却下", variant: "destructive" },
};

const ROLE_LABELS: Record<UserRoleType, string> = {
  admin: "管理者",
  maintainer: "講師/運営",
  member: "受講生",
};

// ロール変更・会員種別の両セレクトで共通のスタイル（幅のみ呼び出し側で追加する）
const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

type StatusFilter = "all" | "pending" | "active" | "rejected";

/**
 * 会員種別セレクトの `<option>` 一覧。承認時・変更時の両セレクトで共有する。
 * `restrictToGeneral` が true の場合、コミュニティ会員は選択不可にする
 * （Stripe契約中ユーザーを一般有料会員以外に設定させないため。2.7節参照）。
 */
function MembershipOptions({ restrictToGeneral }: { restrictToGeneral: boolean }) {
  return (
    <>
      {MEMBERSHIP_TYPES.map((type) => (
        <option
          key={type}
          value={type}
          disabled={restrictToGeneral && type === USER_MEMBERSHIP.COMMUNITY}
        >
          {USER_MEMBERSHIP_LABELS[type]}
        </option>
      ))}
    </>
  );
}

export function UserManagementTable({
  users,
  subscribedUserIds,
  subscriptionDataUnavailable = false,
}: {
  users: UserType[];
  subscribedUserIds: number[];
  subscriptionDataUnavailable?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loadingUserIds, setLoadingUserIds] = useState<Set<number>>(new Set());
  // 承認時に選択する会員種別（ユーザーIDごと。未選択はコミュニティ会員を既定とする。
  // ただしStripe契約中のユーザーはコミュニティ会員を選べないため一般有料会員を既定にする）
  const [membershipByUserId, setMembershipByUserId] = useState<Record<number, MembershipType>>({});
  const subscribedUserIdSet = useMemo(() => new Set(subscribedUserIds), [subscribedUserIds]);

  const filteredUsers = useMemo(
    () => (filter === "all" ? users : users.filter((u) => u.status === filter)),
    [users, filter]
  );

  const pendingCount = useMemo(
    () => users.filter((u) => u.status === USER_STATUS.PENDING).length,
    [users]
  );

  const setLoading = (id: number, loading: boolean) => {
    setLoadingUserIds((prev) => {
      const next = new Set(prev);
      loading ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const getMembership = (userId: number): MembershipType =>
    membershipByUserId[userId] ??
    (subscribedUserIdSet.has(userId) ? USER_MEMBERSHIP.GENERAL : USER_MEMBERSHIP.COMMUNITY);

  /** PATCH /api/admin/users への共通リクエスト処理（ローディング状態・エラー表示・一覧更新をまとめる） */
  const patchUser = async (
    userId: number,
    body: Record<string, unknown>,
    fallbackErrorMessage: string
  ) => {
    setLoading(userId, true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || fallbackErrorMessage);
        return;
      }

      router.refresh();
    } catch {
      alert("エラーが発生しました");
    } finally {
      setLoading(userId, false);
    }
  };

  const handleAction = async (userId: number, action: "approve" | "reject") => {
    const buildRequest = () => {
      if (action === "approve") {
        const membershipType = getMembership(userId);
        return {
          confirmMessage: `このユーザーを「${USER_MEMBERSHIP_LABELS[membershipType]}」として承認しますか？`,
          body: { action, membershipType },
        };
      }
      // 却下すると会員種別は NULL に戻るため、設定済みの場合は解除される旨を明示する
      const currentMembership = users.find((u) => u.id === userId)?.membership_type;
      const messages = [
        currentMembership
          ? `このユーザーを却下しますか？\n現在の会員種別（${USER_MEMBERSHIP_LABELS[currentMembership]}）の設定は解除されます。`
          : "このユーザーを却下しますか？",
      ];
      // Stripeサブスクの自動キャンセル連携はスコープ外のため、却下してもサブスクは残り続ける
      if (subscribedUserIdSet.has(userId)) {
        messages.push(
          "このユーザーはStripeサブスク契約中です。却下してもサブスクは自動解約されないため、Stripeダッシュボードでの手動キャンセルが別途必要です。"
        );
      } else if (subscriptionDataUnavailable) {
        // 契約状況が取得できていないため、契約の有無を判定できない（フェイルクローズ）
        messages.push(
          "Stripe契約状況を取得できなかったため、このユーザーが契約中かどうか判定できません。却下する前にStripeダッシュボードで契約の有無をご確認ください。"
        );
      }
      return {
        confirmMessage: messages.join("\n\n"),
        body: { action },
      };
    };
    const { confirmMessage, body } = buildRequest();

    if (!confirm(confirmMessage)) return;

    await patchUser(userId, body, "操作に失敗しました");
  };

  const handleRoleChange = (userId: number, role: UserRoleType) =>
    patchUser(userId, { action: "change_role", role }, "ロール変更に失敗しました");

  const handleMembershipTypeChange = (userId: number, membershipType: MembershipType) =>
    patchUser(
      userId,
      { action: "change_membership", membershipType },
      "会員種別の変更に失敗しました"
    );

  return (
    <div className="space-y-4">
      {/* フィルター */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "active", "rejected"] as const).map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
          >
            {status === "all" ? "すべて" : STATUS_LABELS[status].label}
            {status === USER_STATUS.PENDING && pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-xs">
                {pendingCount}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* テーブル */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th scope="col" className="text-left px-4 py-3 font-medium">
                ユーザー
              </th>
              <th scope="col" className="text-left px-4 py-3 font-medium">
                ロール
              </th>
              <th scope="col" className="text-left px-4 py-3 font-medium">
                ステータス
              </th>
              <th scope="col" className="text-left px-4 py-3 font-medium">
                会員種別
              </th>
              <th scope="col" className="text-left px-4 py-3 font-medium">
                登録日
              </th>
              <th scope="col" className="text-left px-4 py-3 font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  該当するユーザーがいません
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const statusInfo = STATUS_LABELS[user.status];
                const isLoading = loadingUserIds.has(user.id);
                const isAdmin = user.role === USER_ROLE.ADMIN;
                // Stripe契約中と確定しているか（バッジ表示にも使う一覧が根拠なので確度は高い）
                const isSubscribed = subscribedUserIdSet.has(user.id);

                return (
                  <tr key={user.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{user.display_name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isAdmin ? (
                        <span className="text-muted-foreground">{ROLE_LABELS[user.role]}</span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(user.id, e.target.value as UserRoleType)
                          }
                          className={`${SELECT_CLASS} w-32`}
                        >
                          <option value={USER_ROLE.MEMBER}>{ROLE_LABELS[USER_ROLE.MEMBER]}</option>
                          <option value={USER_ROLE.MAINTAINER}>
                            {ROLE_LABELS[USER_ROLE.MAINTAINER]}
                          </option>
                          <option value={USER_ROLE.ADMIN}>{ROLE_LABELS[USER_ROLE.ADMIN]}</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {user.status === USER_STATUS.ACTIVE ? (
                              <select
                                // status=active と membership_type の整合性はDBでは保証されないため
                                // (CLAUDE.md参照)、未設定（NULL）の active ユーザーも復旧できるよう
                                // membership_type の有無に関わらずセレクトを表示する
                                value={
                                  user.membership_type ??
                                  (isSubscribed
                                    ? USER_MEMBERSHIP.GENERAL
                                    : USER_MEMBERSHIP.COMMUNITY)
                                }
                                disabled={subscriptionDataUnavailable}
                                onChange={(e) =>
                                  handleMembershipTypeChange(
                                    user.id,
                                    e.target.value as MembershipType
                                  )
                                }
                                aria-label={`${user.display_name} の会員種別`}
                                className={`${SELECT_CLASS} w-36`}
                              >
                                <MembershipOptions restrictToGeneral={isSubscribed} />
                              </select>
                            ) : user.membership_type ? (
                              <Badge variant="outline">
                                {USER_MEMBERSHIP_LABELS[user.membership_type]}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                            {isSubscribed && <Badge variant="secondary">サブスク契約中</Badge>}
                          </div>
                          {user.status === USER_STATUS.ACTIVE &&
                            (subscriptionDataUnavailable ? (
                              <span className="text-xs text-muted-foreground">
                                Stripe契約状況を取得できないため変更できません
                              </span>
                            ) : (
                              isSubscribed && (
                                <span className="text-xs text-muted-foreground">
                                  契約中は一般有料会員のみ選択できます（変更するにはStripe側で解約してください）
                                </span>
                              )
                            ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString("ja-JP")
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-2 items-center">
                            {(user.status === USER_STATUS.PENDING ||
                              user.status === USER_STATUS.REJECTED) && (
                              <>
                                <select
                                  value={getMembership(user.id)}
                                  onChange={(e) =>
                                    setMembershipByUserId((prev) => ({
                                      ...prev,
                                      [user.id]: e.target.value as MembershipType,
                                    }))
                                  }
                                  aria-label={`${user.display_name} の会員種別`}
                                  className={`${SELECT_CLASS} w-36`}
                                >
                                  <MembershipOptions restrictToGeneral={isSubscribed} />
                                </select>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAction(user.id, "approve")}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  承認
                                </Button>
                              </>
                            )}
                            {(user.status === USER_STATUS.PENDING ||
                              user.status === USER_STATUS.ACTIVE) &&
                              !isAdmin && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAction(user.id, "reject")}
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <X className="h-3.5 w-3.5 mr-1" />
                                  却下
                                </Button>
                              )}
                          </div>
                          {(user.status === USER_STATUS.PENDING ||
                            user.status === USER_STATUS.REJECTED) &&
                            isSubscribed && (
                              <span className="text-xs text-muted-foreground">
                                契約中は一般有料会員のみ選択できます
                              </span>
                            )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

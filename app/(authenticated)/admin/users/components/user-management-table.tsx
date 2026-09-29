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
import type { ManageUserListItem, MembershipType, UserRoleType, UserStatusType } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<
  UserStatusType,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  trial: { label: "お試し", variant: "secondary" },
  active: { label: "承認済み", variant: "default" },
  rejected: { label: "却下", variant: "destructive" },
};

const ROLE_LABELS: Record<UserRoleType, string> = {
  admin: "管理者",
  maintainer: "講師/運営",
  member: "受講生",
};

const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

const STATUS_FILTERS = ["all", ...Object.values(USER_STATUS)] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Membership `<option>`s shared by the approve and change selects. With restrictToGeneral,
 * community is not
 * selectable, so Stripe-subscribed users can't be set to anything but general (see spec 2.7).
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
  users: ManageUserListItem[];
  subscribedUserIds: number[];
  subscriptionDataUnavailable?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loadingUserIds, setLoadingUserIds] = useState<Set<number>>(new Set());
  // Membership chosen on approval, per user id. Default is community, but general for
  // Stripe-subscribed users
  // since they can't pick community.
  const [membershipByUserId, setMembershipByUserId] = useState<Record<number, MembershipType>>({});
  const subscribedUserIdSet = useMemo(() => new Set(subscribedUserIds), [subscribedUserIds]);

  const filteredUsers = useMemo(
    () => (filter === "all" ? users : users.filter((u) => u.status === filter)),
    [users, filter]
  );

  const trialCount = useMemo(
    () => users.filter((u) => u.status === USER_STATUS.TRIAL).length,
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
      // Rejecting resets membership_type to NULL, so state that an existing one is cleared.
      const currentMembership = users.find((u) => u.id === userId)?.membership_type;
      const messages = [
        currentMembership
          ? `このユーザーを却下しますか？\n現在の会員種別（${USER_MEMBERSHIP_LABELS[currentMembership]}）の設定は解除されます。`
          : "このユーザーを却下しますか？",
      ];
      // Automatic subscription cancellation on reject is out of scope; the subscription remains.
      if (subscribedUserIdSet.has(userId)) {
        messages.push(
          "このユーザーはStripeサブスク契約中です。却下してもサブスクは自動解約されないため、Stripeダッシュボードでの手動キャンセルが別途必要です。"
        );
      } else if (subscriptionDataUnavailable) {
        // Fail closed: the subscription status couldn't be fetched, so whether a contract exists is
        // unknown.
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
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
          >
            {status === "all" ? "すべて" : STATUS_LABELS[status].label}
            {status === USER_STATUS.TRIAL && trialCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-xs">
                {trialCount}
              </Badge>
            )}
          </Button>
        ))}
      </div>

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
                                // status=active / membership_type consistency isn't guaranteed by
                                // the DB (see AGENTS.md), so show the select
                                // regardless of membership_type so active users with NULL can be
                                // repaired.
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
                            {(user.status === USER_STATUS.TRIAL ||
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
                            {(user.status === USER_STATUS.TRIAL ||
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
                          {(user.status === USER_STATUS.TRIAL ||
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

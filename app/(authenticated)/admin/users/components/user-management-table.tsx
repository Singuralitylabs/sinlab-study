"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import type { UserRoleType, UserStatusType, UserType } from "@/app/types";
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

type StatusFilter = "all" | "pending" | "active" | "rejected";

export function UserManagementTable({ users }: { users: UserType[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loadingUserIds, setLoadingUserIds] = useState<Set<number>>(new Set());

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

  const handleAction = async (userId: number, action: "approve" | "reject") => {
    const confirmMessage =
      action === "approve" ? "このユーザーを承認しますか？" : "このユーザーを却下しますか？";

    if (!confirm(confirmMessage)) return;

    setLoading(userId, true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "操作に失敗しました");
        return;
      }

      router.refresh();
    } catch {
      alert("エラーが発生しました");
    } finally {
      setLoading(userId, false);
    }
  };

  const handleRoleChange = async (userId: number, role: UserRoleType) => {
    setLoading(userId, true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "change_role", role }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "ロール変更に失敗しました");
        return;
      }

      router.refresh();
    } catch {
      alert("エラーが発生しました");
    } finally {
      setLoading(userId, false);
    }
  };

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
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  該当するユーザーがいません
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const statusInfo = STATUS_LABELS[user.status];
                const isLoading = loadingUserIds.has(user.id);
                const isAdmin = user.role === USER_ROLE.ADMIN;

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
                          className="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString("ja-JP")
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <div className="flex gap-2">
                          {(user.status === USER_STATUS.PENDING ||
                            user.status === USER_STATUS.REJECTED) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(user.id, "approve")}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                            >
                              <Check className="h-3.5 w-3.5 mr-1" />
                              承認
                            </Button>
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

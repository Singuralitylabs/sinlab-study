"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { USER_STATUS } from "@/app/constants/user";
import { useSupabaseAuth } from "@/app/providers/supabase-auth-provider";
import { fetchUserStatusById } from "@/app/services/api/users-client";
import type { UserStatusType } from "@/app/types";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSupabaseAuth();
  const [userStatus, setUserStatus] = useState<UserStatusType | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const checkUserStatus = async () => {
      try {
        const { status, error } = await fetchUserStatusById({
          authId: user.id,
        });

        if (error || !status) {
          window.location.href = "/login";
          return;
        }

        if (status === USER_STATUS.PENDING) {
          window.location.href = "/pending";
          return;
        }
        if (status === USER_STATUS.REJECTED) {
          window.location.href = "/rejected";
          return;
        }
        if (status !== USER_STATUS.ACTIVE) {
          console.error("不正なユーザーステータス:", status);
          window.location.href = "/login";
          return;
        }
        setUserStatus(status as UserStatusType);
      } catch (error) {
        console.error("ユーザーステータス確認エラー:", error);
        window.location.href = "/login";
      } finally {
        setStatusLoading(false);
      }
    };

    checkUserStatus();
  }, [user, loading]);

  if (loading || statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (user && userStatus === USER_STATUS.ACTIVE) {
    return <>{children}</>;
  }

  return null;
}

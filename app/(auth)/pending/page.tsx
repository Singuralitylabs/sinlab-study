"use client";

import { Clock, LogOut } from "lucide-react";
import { createClientSupabaseClient } from "@/app/services/api/supabase-client";
import { Button } from "@/components/ui/button";

export default function PendingPage() {
  const handleSignOut = async () => {
    const supabase = createClientSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <Clock className="h-12 w-12 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">承認待ち</h1>
          <p className="text-sm text-muted-foreground">
            アカウントの承認を待っています。
            管理者が承認すると、学習コンテンツにアクセスできるようになります。
          </p>
        </div>
        <Button variant="outline" onClick={handleSignOut} className="w-full">
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </div>
  );
}

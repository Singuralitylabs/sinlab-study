"use client";

import { LogOut, ShieldX } from "lucide-react";
import { createClientSupabaseClient } from "@/app/services/api/supabase-client";
import { Button } from "@/components/ui/button";

export default function RejectedPage() {
  const handleSignOut = async () => {
    const supabase = createClientSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <ShieldX className="h-12 w-12 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">アクセスが拒否されました</h1>
          <p className="text-sm text-muted-foreground">
            このアカウントへのアクセスは管理者により却下されました。
            ご不明な点がある場合は、管理者にお問い合わせください。
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

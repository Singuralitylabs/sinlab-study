"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  TERMS_CONSENT_COOKIE_MAX_AGE,
  TERMS_CONSENT_COOKIE_NAME,
  TERMS_CONSENT_COOKIE_VALUE,
} from "@/app/constants/auth";
import { PRIVACY_URL, TERMS_URL } from "@/app/constants/legal";
import { createClientSupabaseClient } from "@/app/services/api/supabase-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function GoogleLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const handleGoogleLogin = async () => {
    if (!agreed) {
      return;
    }
    setLoading(true);
    setError(null);

    // 初回登録の同意チェックをサーバー側で検証できるよう、OAuth 開始直前に
    // 短寿命の同意 Cookie をセットする（SameSite=Lax のため OAuth の往復を跨いで届く）。
    // Cookie Store API は非同期のため、OAuth 開始直前の同期的セットには document.cookie を使う。
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    // biome-ignore lint/suspicious/noDocumentCookie: 上記の理由により Cookie Store API は使えない
    document.cookie = `${TERMS_CONSENT_COOKIE_NAME}=${TERMS_CONSENT_COOKIE_VALUE}; Max-Age=${TERMS_CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;

    const supabase = createClientSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error("ログインエラー:", error);
      setError("ログインに失敗しました。もう一度お試しください。");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Checkbox
          id="terms-consent"
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
          aria-describedby={agreed ? undefined : "terms-consent-description"}
        />
        <label htmlFor="terms-consent" className="text-xs text-muted-foreground leading-relaxed">
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            利用規約
          </a>
          および
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            プライバシーポリシー
          </a>
          に同意する
        </label>
      </div>
      <Button
        onClick={handleGoogleLogin}
        disabled={loading || !agreed}
        className="w-full h-12 text-base"
        variant="outline"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
        ) : (
          <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        )}
        Googleでログイン
      </Button>
      {!agreed && (
        <p id="terms-consent-description" className="text-xs text-muted-foreground text-center">
          ログインするには上記の同意が必要です
        </p>
      )}
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
    </div>
  );
}

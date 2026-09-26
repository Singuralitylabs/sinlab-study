import { BookOpen } from "lucide-react";
import { TERMS_REQUIRED_ERROR_CODE } from "@/app/constants/auth";
import { PRIVACY_URL, TERMS_URL } from "@/app/constants/legal";
import { GoogleLoginButton } from "./components/google-login-button";
import { LoginServiceIntro } from "./components/login-service-intro";

/** `/login?error=` で表示するメッセージ。未知の値は何も出さない */
const LOGIN_ERROR_MESSAGES = {
  registration_failed:
    "アカウント登録に失敗しました。時間をおいて再度お試しください。問題が続く場合は管理者にお問い合わせください。",
  [TERMS_REQUIRED_ERROR_CODE]:
    "利用規約およびプライバシーポリシーへの同意の確認ができませんでした。Google でのアカウント選択・認証に時間がかかった場合も確認できなくなるため、チェックボックスにチェックを入れて再度ログインしてください。",
} as const;

type LoginErrorCode = keyof typeof LOGIN_ERROR_MESSAGES;

function loginErrorMessage(error: string | undefined): string | null {
  if (error && Object.hasOwn(LOGIN_ERROR_MESSAGES, error)) {
    return LOGIN_ERROR_MESSAGES[error as LoginErrorCode];
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = loginErrorMessage(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-4xl grid gap-10 lg:grid-cols-2 lg:gap-12 items-center">
        <div className="w-full max-w-sm mx-auto space-y-8 order-1 lg:order-2">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <BookOpen className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Sinlab Study</h1>
            <p className="text-sm text-muted-foreground">AIと学ぶ実践Web技術講座</p>
          </div>

          <div className="border border-border rounded-lg p-6 space-y-6 bg-card">
            <div className="text-center">
              <h2 className="text-lg font-semibold">ログイン</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Googleアカウントでログインしてください
              </p>
            </div>
            {errorMessage && <p className="text-sm text-destructive text-center">{errorMessage}</p>}
            <GoogleLoginButton />
          </div>

          <p className="text-xs text-muted-foreground text-center">
            ログイン後すぐに、お試し公開コンテンツの閲覧・課題提出をご利用いただけます。
          </p>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              プライバシーポリシー
            </a>
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              利用規約
            </a>
            <a
              href="https://sinlab.future-tech-association.org/sinlab-study/legal.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              特定商取引法に基づく表記
            </a>
          </div>
        </div>

        <div className="w-full max-w-sm mx-auto lg:max-w-none order-2 lg:order-1">
          <LoginServiceIntro />
        </div>
      </div>
    </div>
  );
}

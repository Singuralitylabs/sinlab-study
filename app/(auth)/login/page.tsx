import { BookOpen } from "lucide-react";
import { Noto_Sans_JP } from "next/font/google";
import { TERMS_REQUIRED_ERROR_CODE } from "@/app/constants/auth";
import { COMMERCIAL_TRANSACTIONS_URL, PRIVACY_URL, TERMS_URL } from "@/app/constants/legal";
import { isStripeEnabled } from "@/app/constants/stripe";
import { GoogleLoginButton } from "./components/google-login-button";
import { LearningScreens } from "./components/learning-screens";
import { ServiceIntro } from "./components/service-intro";

// Same typeface as the LP. Loaded here rather than in the root layout since only the login screen
// uses it. CJK fonts are split into dozens of files by unicode-range, so don't preload; use the
// same swap as the LP. The auto-generated fallback (Arial + size-adjust) only fixes Latin metric
// shifts; Japanese shows in the OS CJK font until loading completes.
const notoSansJp = Noto_Sans_JP({
  display: "swap",
  preload: false,
});

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

  // Below lg the DOM order is brand -> login card -> intro -> learning screens, stacked. The intro
  // and learning-screen bands extend edge to edge (and to the bottom of the screen) as one piece,
  // so the grid itself has no horizontal/bottom padding or row gap below lg. From lg up it is two
  // columns (brand/intro on the left, login card on the right) with the learning screens full-width
  // below. word-break: auto-phrase wraps Japanese by phrase (normal wrapping in unsupported
  // browsers).
  return (
    <div
      className={`login-theme ${notoSansJp.className} min-h-screen bg-background text-foreground [word-break:auto-phrase]`}
    >
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 grid-rows-[auto_auto_auto_1fr] pt-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_auto_auto] lg:content-center lg:items-center lg:gap-x-16 lg:gap-y-7 lg:px-8 lg:py-14">
        <header className="flex flex-col items-center gap-1.5 px-4 pb-6 text-center lg:col-start-1 lg:row-start-1 lg:flex-row lg:gap-3 lg:px-0 lg:pb-0 lg:text-left">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground lg:h-10 lg:w-10">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold lg:mt-0 lg:text-xl">Sinlab Study</h1>
          <p className="text-sm text-muted-foreground">AIと学ぶ実践Web技術講座</p>
        </header>

        <div className="mx-auto w-full max-w-md space-y-5 px-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none lg:px-0">
          <div className="space-y-6 rounded-2xl border border-border bg-card px-5 py-6 shadow-[var(--login-card-shadow)] sm:p-8">
            <div className="text-center">
              <h2 className="text-xl font-extrabold">ログイン</h2>
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
              href={COMMERCIAL_TRANSACTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              特定商取引法に基づく表記
            </a>
          </div>
        </div>

        <div className="mt-10 bg-secondary px-4 py-10 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto max-w-xl lg:max-w-none">
            <ServiceIntro showMonthlyPrice={isStripeEnabled()} />
          </div>
        </div>

        <div className="bg-secondary px-4 pb-10 lg:col-span-2 lg:row-start-3 lg:mt-7 lg:border-t lg:border-border lg:bg-transparent lg:px-0 lg:pt-12 lg:pb-0">
          <div className="mx-auto max-w-xl lg:max-w-none">
            <LearningScreens />
          </div>
        </div>
      </div>
    </div>
  );
}

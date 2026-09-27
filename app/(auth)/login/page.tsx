import { BookOpen } from "lucide-react";
import { Noto_Sans_JP } from "next/font/google";
import { TERMS_REQUIRED_ERROR_CODE } from "@/app/constants/auth";
import { COMMERCIAL_TRANSACTIONS_URL, PRIVACY_URL, TERMS_URL } from "@/app/constants/legal";
import { isStripeEnabled } from "@/app/constants/stripe";
import { GoogleLoginButton } from "./components/google-login-button";
import { ServiceIntro } from "./components/service-intro";

// LP と同じ書体。ログイン画面だけで使うため、ルートレイアウトではなくここで読み込む。
// CJK フォントは unicode-range で数十ファイルに分割されるため preload せず、LP と同じ swap で表示する
// （切り替わり時のずれは next/font が自動生成するサイズ調整済みフォールバックで抑える）
const notoSansJp = Noto_Sans_JP({
  display: "swap",
  preload: false,
});

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

  // スマホ・タブレット幅は ブランド → ログインカード → 紹介 の縦積み（DOM 順）。紹介の帯は
  // 画面端まで・画面下端まで伸ばすため、グリッド自体には lg 未満の左右・下のパディングを付けない。
  // lg 以上は左列に ブランド／紹介、右列にログインカードを置く2カラム。
  // word-break: auto-phrase は日本語を文節単位で折り返す（非対応ブラウザは通常の折り返し）
  return (
    <div
      className={`login-theme ${notoSansJp.className} min-h-screen bg-background text-foreground [word-break:auto-phrase]`}
    >
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 grid-rows-[auto_auto_1fr] gap-6 pt-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_auto] lg:content-center lg:items-center lg:gap-x-16 lg:gap-y-7 lg:px-8 lg:py-14">
        <header className="flex flex-col items-center gap-1.5 px-4 text-center lg:col-start-1 lg:row-start-1 lg:flex-row lg:gap-3 lg:px-0 lg:text-left">
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

        <div className="mt-4 bg-secondary px-4 py-10 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto max-w-xl lg:max-w-none">
            <ServiceIntro showMonthlyPrice={isStripeEnabled()} />
          </div>
        </div>
      </div>
    </div>
  );
}

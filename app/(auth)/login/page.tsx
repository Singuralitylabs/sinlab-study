import { BookOpen } from "lucide-react";
import { GoogleLoginButton } from "./components/google-login-button";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
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
          <GoogleLoginButton />
        </div>

        <p className="text-xs text-muted-foreground text-center">
          初回ログイン後、管理者の承認が完了するまでお待ちください。
        </p>
      </div>
    </div>
  );
}

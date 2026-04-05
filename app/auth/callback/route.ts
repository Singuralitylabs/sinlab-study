import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import { sendSlackNewUserNotification } from "@/app/services/notifications/slack";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // cookieを蓄積するための配列
  const cookiesToReturn: {
    name: string;
    value: string;
    options: CookieOptions;
  }[] = [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[]
      ) {
        // cookieを配列に蓄積（後でリダイレクトレスポンスに設定する）
        cookiesToReturn.push(...cookiesToSet);
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error("セッション交換エラー:", error);
    return NextResponse.redirect(new URL("/login", origin));
  }

  const user = data.session.user;

  // usersテーブルでユーザーの存在を確認
  const { data: existingUser, error: userError } = await supabase
    .from("users")
    .select("id, status")
    .eq("auth_id", user.id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (userError) {
    console.error("ユーザー確認エラー:", userError);
  }

  // リダイレクト先を決定
  let redirectPath = "/";

  if (!existingUser) {
    // 初回ログイン: ユーザーを自動登録
    const { error: insertError } = await supabase.from("users").insert({
      auth_id: user.id,
      email: user.email || "",
      display_name: user.user_metadata?.full_name || user.email || "",
      avatar_url: user.user_metadata?.avatar_url || null,
      role: USER_ROLE.MEMBER,
      status: USER_STATUS.PENDING,
    });

    if (insertError) {
      console.error("ユーザー自動登録エラー:", insertError);
    } else {
      const adminUsersUrl = `${origin}/admin/users`;
      sendSlackNewUserNotification({
        displayName: user.user_metadata?.full_name || user.email || "",
        email: user.email || "",
        adminUsersUrl,
      });
    }

    redirectPath = "/pending";
  } else if (existingUser.status === USER_STATUS.PENDING) {
    redirectPath = "/pending";
  } else if (existingUser.status === USER_STATUS.REJECTED) {
    redirectPath = "/rejected";
  }

  // リダイレクトレスポンスを作成し、蓄積したcookieを設定
  const redirectResponse = NextResponse.redirect(new URL(redirectPath, origin));
  for (const { name, value, options } of cookiesToReturn) {
    redirectResponse.cookies.set(name, value, options);
  }

  return redirectResponse;
}

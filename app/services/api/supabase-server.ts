import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type SupabaseClientLike = ReturnType<typeof createClient> | ReturnType<typeof createServerClient>;

class MissingSupabaseQueryBuilder {
  select() {
    return this;
  }

  insert() {
    return this;
  }

  update() {
    return this;
  }

  delete() {
    return this;
  }

  eq() {
    return this;
  }

  in() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  single() {
    return Promise.resolve({ data: null, error: { message: "Supabase環境変数が未設定です" } });
  }

  maybeSingle() {
    return Promise.resolve({ data: null, error: { message: "Supabase環境変数が未設定です" } });
  }
}

class MissingSupabaseClient {
  from() {
    return new MissingSupabaseQueryBuilder();
  }
}

function createMissingSupabaseClient() {
  return new MissingSupabaseClient();
}

// サーバーサイド用Supabaseクライアント（認証付き）
export async function createServerSupabaseClient(): Promise<SupabaseClientLike> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return createMissingSupabaseClient();
  }
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // サーバーコンポーネントで呼び出された場合のエラーハンドリング
        }
      },
    },
  });
}

// サーバーサイド用Supabaseクライアント（Service Role: RLSバイパス）
// レイアウトで権限チェック済みの管理者・講師向けクエリに使用
export async function createAdminSupabaseClient(): Promise<SupabaseClientLike> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      return createMissingSupabaseClient();
    }
    return createClient(url, serviceRoleKey);
  }
  // Service Role Key未設定時は通常クライアントにフォールバック
  return createServerSupabaseClient();
}

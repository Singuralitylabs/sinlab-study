import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // The second argument (headers such as Cache-Control) is not accepted: it cannot be set on
      // the response via next/headers. Token refresh normally happens first in proxy.ts, which
      // sets those headers.
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Expected when called from a Server Component (cookies cannot be set).
        }
      },
    },
  });
}

// Service role client (bypasses RLS) for permission-checked admin / instructor queries and server
// work reading rows hidden by RLS from the normal client (users existence check in the OAuth
// callback).
// Throws when SUPABASE_SERVICE_ROLE_KEY is unset: there is no implicit fallback to the normal
// client. Paths that need the RLS-applied client must explicitly choose
// createServerSupabaseClient().
// SupabaseClient is used because ReturnType<typeof createClient> resolves to the generic
// constraint and makes the schema `never`. `async` is kept for caller compatibility (no await
// inside).
let cachedAdminClient: SupabaseClient | null = null;

export async function createAdminSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が設定されていません。Service Role クライアントにはキーが必須です"
    );
  }
  if (cachedAdminClient) {
    return cachedAdminClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL");
  }
  cachedAdminClient = createClient(url, serviceRoleKey);
  return cachedAdminClient;
}

import { vi } from "vitest";

/** from().select()... チェーンの解決値（count クエリは count も返す） */
export interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

/**
 * Supabase クエリビルダーのモックを作成する。
 *
 * リスト取得（.order() 後に直接 await）と単一取得（.single() / .maybeSingle()）の
 * 両パターンに対応するため、then/catch/finally を実装して thenable にしている。
 */
export function createQueryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    // リスト取得は await builder そのものを解決する
    // biome-ignore lint/suspicious/noThenProperty: Supabase クエリビルダーの thenable を再現するため意図的に定義
    then: (onfulfilled: (v: typeof result) => unknown, onrejected?: (r: unknown) => unknown) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected: (r: unknown) => unknown) => Promise.resolve(result).catch(onrejected),
    finally: (onfinally: () => void) => Promise.resolve(result).finally(onfinally),
  };
  return builder;
}

/**
 * Supabase クライアントモックを生成する。
 *
 * @param authResult auth.getUser() の戻り値。省略時は { data: { user: null }, error: null }
 * @param queryResult from().select()... チェーンの解決値。省略時は { data: null, error: null }
 * @param tableResults テーブル名ごとの解決値。指定したテーブルは queryResult より優先される
 *                     （1関数内で複数テーブルを照会するケース用）。
 *                     配列を渡すと from() の呼び出し順に消費される（ページング等の複数回照会用。
 *                     末尾を超えた呼び出しには最後の要素を返し続ける）
 */
export function createMockSupabaseClient({
  authResult,
  queryResult,
  tableResults,
}: {
  authResult?: { data: { user: unknown }; error: unknown };
  queryResult?: QueryResult;
  tableResults?: Record<string, QueryResult | QueryResult[]>;
} = {}) {
  const callCounts: Record<string, number> = {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue(authResult ?? { data: { user: null }, error: null }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      const configured = tableResults?.[table];
      let result: QueryResult | undefined;
      if (Array.isArray(configured)) {
        // 空配列は未指定として扱い、queryResult / デフォルト結果にフォールバックする
        if (configured.length > 0) {
          const index = Math.min(callCounts[table] ?? 0, configured.length - 1);
          callCounts[table] = (callCounts[table] ?? 0) + 1;
          result = configured[index];
        }
      } else {
        result = configured;
      }
      return createQueryBuilder(result ?? queryResult ?? { data: null, error: null });
    }),
  };
}

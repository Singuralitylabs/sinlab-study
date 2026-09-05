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
    is: vi.fn().mockReturnThis(),
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
 * 呼び出し順に応じて設定済みの結果を1件選ぶ。配列は呼び出し順に消費し
 * （末尾を超えたら最後の要素を返し続ける）、空配列は未指定として扱う。
 */
function pickConfiguredResult(
  configured: QueryResult | QueryResult[] | undefined,
  callCounts: Record<string, number>,
  key: string
): QueryResult | undefined {
  if (!Array.isArray(configured)) {
    return configured;
  }
  if (configured.length === 0) {
    return undefined;
  }
  const index = Math.min(callCounts[key] ?? 0, configured.length - 1);
  callCounts[key] = (callCounts[key] ?? 0) + 1;
  return configured[index];
}

/**
 * Supabase クライアントモックを生成する。
 *
 * @param authResult auth.getUser() の戻り値。省略時は { data: { user: null }, error: null }
 * @param queryResult from().select()... / rpc() チェーンの解決値。省略時は { data: null, error: null }
 * @param tableResults テーブル名ごとの解決値。指定したテーブルは queryResult より優先される
 *                     （1関数内で複数テーブルを照会するケース用）。
 *                     配列を渡すと from() の呼び出し順に消費される（ページング等の複数回照会用。
 *                     末尾を超えた呼び出しには最後の要素を返し続ける）
 * @param rpcResults RPC関数名ごとの解決値。tableResults と同様、配列を渡すと rpc() の
 *                   呼び出し順に消費される。未指定の関数は from() と同様 queryResult にフォールバックする
 */
export function createMockSupabaseClient({
  authResult,
  queryResult,
  tableResults,
  rpcResults,
}: {
  authResult?: { data: { user: unknown }; error: unknown };
  queryResult?: QueryResult;
  tableResults?: Record<string, QueryResult | QueryResult[]>;
  rpcResults?: Record<string, QueryResult | QueryResult[]>;
} = {}) {
  const callCounts: Record<string, number> = {};
  const rpcCallCounts: Record<string, number> = {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue(authResult ?? { data: { user: null }, error: null }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      const result = pickConfiguredResult(tableResults?.[table], callCounts, table);
      return createQueryBuilder(result ?? queryResult ?? { data: null, error: null });
    }),
    // .order() / .range() 等でチェーンされるため from() と同じビルダーを返す
    rpc: vi.fn().mockImplementation((fn: string) => {
      const result = pickConfiguredResult(rpcResults?.[fn], rpcCallCounts, fn);
      return createQueryBuilder(result ?? queryResult ?? { data: null, error: null });
    }),
  };
}

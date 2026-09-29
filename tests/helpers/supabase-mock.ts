import { vi } from "vitest";

export interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

/**
 * Supabase query builder mock. Implemented as a thenable (then/catch/finally) to support both list
 * queries (awaited right after .order()) and single queries (.single() / .maybeSingle()).
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
    or: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    // List queries resolve by awaiting the builder itself.
    // biome-ignore lint/suspicious/noThenProperty: mimics the Supabase builder thenable
    then: (onfulfilled: (v: typeof result) => unknown, onrejected?: (r: unknown) => unknown) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected: (r: unknown) => unknown) => Promise.resolve(result).catch(onrejected),
    finally: (onfinally: () => void) => Promise.resolve(result).finally(onfinally),
  };
  return builder;
}

/**
 * Pick the configured result by call order: arrays are consumed per call (the last element repeats
 * past the end); an empty array counts as unspecified.
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
 * Creates a Supabase client mock.
 * @param authResult auth.getUser() result (default { data: { user: null }, error: null })
 * @param queryResult resolved value of from().select()... / rpc() chains (default { data: null,
 * error: null })
 * @param tableResults per-table results, taking precedence over queryResult (for functions querying
 * several
 *   tables). An array is consumed per from() call (paging, repeated queries); the last element
 *   repeats past the end.
 * @param rpcResults per-RPC results; arrays are consumed per rpc() call like tableResults.
 * Unspecified
 *   functions fall back to queryResult, like from().
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
    // Chained with .order() / .range() etc., so return the same builder as from().
    rpc: vi.fn().mockImplementation((fn: string) => {
      const result = pickConfiguredResult(rpcResults?.[fn], rpcCallCounts, fn);
      return createQueryBuilder(result ?? queryResult ?? { data: null, error: null });
    }),
  };
}

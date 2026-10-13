export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  thoughtsTokens: number | null;
}

/**
 * null means the count was not reported. Two nulls stay null so a missing reading is not stored
 * as 0 and later mistaken for a real zero-token call.
 */
export function addTokenCount(previous: number | null, current: number | null): number | null {
  if (previous === null && current === null) {
    return null;
  }
  return (previous ?? 0) + (current ?? 0);
}

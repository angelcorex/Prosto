/**
 * Server-side rate-limit guard.
 *
 * Calls the DB `check_rate_limit` function (fixed-window counter per user) and
 * returns `false` when the caller has exceeded the limit. The DB raises a
 * `rate_limited` error which surfaces here as a failed RPC, so a thrown/blocked
 * result maps to a clean boolean for the caller to branch on.
 *
 * Takes the minimal `{ rpc }` shape so it works with any Supabase client
 * instance regardless of its generated `Database` typing.
 */
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>;
};

export async function checkRateLimit(
  supabase: RpcClient,
  action: string,
  max: number,
  windowSecs: number,
): Promise<boolean> {
  const { error } = await supabase.rpc('check_rate_limit', {
    p_action: action,
    p_max: max,
    p_window_secs: windowSecs,
  });
  return !error;
}

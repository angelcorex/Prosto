/** Extract a server-invite code from message text (matches /i/<code> or
 *  the legacy /sinvite/<token>), or null when there's no invite link. */
export function inviteTokenOf(content: string): string | null {
  const m = content.match(/\/(?:i|sinvite)\/([A-Za-z0-9]{4,})/);
  return m?.[1] ?? null;
}

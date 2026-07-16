import 'server-only';

import { cookies } from 'next/headers';

import { seal, open } from './crypto';
import { MAX_ACCOUNTS } from './constants';

export { MAX_ACCOUNTS };

/**
 * Device-local store of the accounts a user keeps signed in for quick switching
 * (Discord/Twitter style). It holds only `{ id, rt }` — a profile id and its
 * Supabase refresh token — for each account, encrypted (see ./crypto) inside a
 * single HttpOnly + Secure + SameSite cookie.
 *
 * Security model:
 *  - HttpOnly  → not readable by JavaScript, so XSS can't lift the tokens.
 *  - Secure    → HTTPS only (in production).
 *  - SameSite  → sent only on same-site navigations (CSRF mitigation).
 *  - Encrypted → the value is opaque; useless without the server key.
 *
 * Refresh tokens never reach the client: all switching happens in server
 * actions that read this store, mint a session, and rotate the stored token.
 */
export const ACCOUNTS_COOKIE = 'prosto-accts';

export interface StoredAccount {
  /** profiles.id / auth user id */
  id: string;
  /** Supabase refresh token (rotated on every switch). */
  rt: string;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 90, // 90 days
};

/** Read the stored accounts (decrypted). Safe in any server context. */
export async function readAccounts(): Promise<StoredAccount[]> {
  const store = await cookies();
  const raw = store.get(ACCOUNTS_COOKIE)?.value;
  if (!raw) return [];
  const list = open<StoredAccount[]>(raw);
  if (!Array.isArray(list)) return [];
  return list.filter((a) => a && typeof a.id === 'string' && typeof a.rt === 'string');
}

/** Persist the account list (encrypted). Only valid in a Server Action / Route Handler. */
export async function writeAccounts(list: StoredAccount[]): Promise<void> {
  const store = await cookies();
  const trimmed = list.slice(0, MAX_ACCOUNTS);
  if (trimmed.length === 0) {
    store.delete(ACCOUNTS_COOKIE);
    return;
  }
  store.set(ACCOUNTS_COOKIE, seal(trimmed), COOKIE_OPTIONS);
}

/** Add a new account or refresh an existing one's token (keeps it most-recent). */
export async function upsertAccount(id: string, rt: string): Promise<void> {
  if (!id || !rt) return;
  const list = await readAccounts();
  const idx = list.findIndex((a) => a.id === id);
  if (idx !== -1) {
    list[idx] = { id, rt };
  } else {
    list.push({ id, rt });
  }
  await writeAccounts(list);
}

/** Remove one account from the store; returns the remaining list. */
export async function removeAccount(id: string): Promise<StoredAccount[]> {
  const list = (await readAccounts()).filter((a) => a.id !== id);
  await writeAccounts(list);
  return list;
}

/** Look up a single stored account by id. */
export async function getStoredAccount(id: string): Promise<StoredAccount | undefined> {
  return (await readAccounts()).find((a) => a.id === id);
}

/** Forget every stored account on this device (used on full sign-out). */
export async function clearAccounts(): Promise<void> {
  const store = await cookies();
  store.delete(ACCOUNTS_COOKIE);
}

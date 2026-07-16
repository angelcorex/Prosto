// ─────────────────────────────────────────────────────────────────────────
// Admin account recovery — set a new password and/or email for a user who
// lost access. Developer/owner tool only.
//
// How it works (and why it's safe):
//   • Password hashes are one-way — the stored hash can never be "read back".
//     This tool doesn't try to. It OVERWRITES the credential with a new
//     password via the Supabase (GoTrue) admin API, which hashes it with the
//     standard algorithm (bcrypt) and a fresh salt. The old hash is discarded.
//   • Plaintext is never stored anywhere — only sent once over TLS to the auth
//     server, which hashes it. You (and the DB) only ever hold the hash.
//   • Email changes go through the admin API too, so the linked auth identity
//     row stays consistent (a raw SQL UPDATE would leave it stale).
//
// Requires the service-role key (full admin, server-only). It's read
// automatically from .env.local / .env, or from the environment.
//
// Usage (from repo root):
//   node scripts/admin-user.mjs find     <email|username|userId>
//   node scripts/admin-user.mjs password <email|username|userId> "NewStrongPass123"
//   node scripts/admin-user.mjs email    <email|username|userId> new@email.com
//   node scripts/admin-user.mjs set      <email|username|userId> --password "New123" --email new@email.com
//
// npm alias:  npm run admin -- password <id> "NewStrongPass123"
//
// SECURITY: the service-role key bypasses all Row-Level Security. Never commit
// it, never paste it into client code, run this only in a trusted terminal.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader: fills process.env from local files without overriding
 *  variables already set in the real environment. Later files don't clobber
 *  earlier ones, so .env.local wins over .env. */
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    let text;
    try { text = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

function usage() {
  console.log(`Account recovery (admin)

  node scripts/admin-user.mjs find     <email|username|userId>
  node scripts/admin-user.mjs password <email|username|userId> "NewStrongPass123"
  node scripts/admin-user.mjs email    <email|username|userId> new@email.com
  node scripts/admin-user.mjs set      <email|username|userId> --password "New123" --email new@email.com
`);
  process.exit(1);
}

loadEnv();

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  fail('Missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or the environment).');
}

const [cmd, identifier, ...rest] = process.argv.slice(2);
if (!cmd || !identifier) usage();

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve an email / username / userId to a full auth user object. */
async function resolveUser(id) {
  // 1) Looks like a UUID → treat as the auth user id.
  if (UUID_RE.test(id)) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data?.user) fail(`No user with id ${id}${error ? ` (${error.message})` : ''}`);
    return data.user;
  }

  // 2) Contains "@" → look up by email (paginate the user list).
  if (id.includes('@')) {
    const needle = id.toLowerCase();
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) fail(`listUsers failed: ${error.message}`);
      const hit = data.users.find((u) => u.email?.toLowerCase() === needle);
      if (hit) return hit;
      if (data.users.length < 200) break;
    }
    fail(`No user found with email ${id}`);
  }

  // 3) Otherwise → username in public.profiles (service role bypasses RLS).
  const uname = id.trim().toLowerCase();
  const { data: prof, error: pErr } = await admin
    .from('profiles')
    .select('id, username')
    .eq('username', uname)
    .maybeSingle();
  if (pErr) fail(`profiles lookup failed: ${pErr.message}`);
  if (!prof) fail(`No profile with username @${uname}`);
  const { data, error } = await admin.auth.admin.getUserById(prof.id);
  if (error || !data?.user) fail(`Profile @${uname} has no auth user${error ? ` (${error.message})` : ''}`);
  return data.user;
}

/** Print a compact summary of a user (never prints secrets). */
async function printUser(user) {
  const { data: prof } = await admin
    .from('profiles')
    .select('username, display_name')
    .eq('id', user.id)
    .maybeSingle();
  console.log('  id:          ', user.id);
  console.log('  email:       ', user.email ?? '(none)');
  console.log('  username:    ', prof?.username ?? '(no profile)');
  console.log('  display_name:', prof?.display_name ?? '(none)');
  console.log('  confirmed:   ', user.email_confirmed_at ? 'yes' : 'no');
  console.log('  created:     ', user.created_at);
  console.log('  last sign-in:', user.last_sign_in_at ?? '(never)');
}

async function setPassword(user, newPassword) {
  if (!newPassword) fail('Provide the new password.');
  if (newPassword.length < 10) {
    console.warn('\x1b[33m! Password is shorter than the app minimum (10). Proceeding anyway (admin override).\x1b[0m');
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) fail(`Password update failed: ${error.message}`);
  console.log(`\x1b[32m✔ Password reset for ${user.email ?? user.id} — old hash discarded, new one hashed by the auth server.\x1b[0m`);
}

async function setEmail(user, newEmail) {
  if (!newEmail || !newEmail.includes('@')) fail('Provide a valid new email.');
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email: newEmail,
    email_confirm: true, // mark confirmed so they can log in immediately
  });
  if (error) fail(`Email update failed: ${error.message}`);
  console.log(`\x1b[32m✔ Email changed to ${newEmail} (confirmed).\x1b[0m`);
}

/** Read a flag value from the remaining args (--password X / --email Y). */
function flag(name) {
  const i = rest.indexOf(`--${name}`);
  return i !== -1 ? rest[i + 1] : undefined;
}

const user = await resolveUser(identifier);

switch (cmd) {
  case 'find':
    console.log('User found:');
    await printUser(user);
    break;

  case 'password':
    await setPassword(user, rest[0]);
    break;

  case 'email':
    await setEmail(user, rest[0]);
    break;

  case 'set': {
    const pw = flag('password');
    const em = flag('email');
    if (!pw && !em) fail('Nothing to set. Pass --password and/or --email.');
    if (pw) await setPassword(user, pw);
    if (em) await setEmail(user, em);
    break;
  }

  default:
    usage();
}

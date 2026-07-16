/**
 * Email address rules — keep sign-ups to real, deliverable inboxes.
 *
 * We don't try to verify that a specific mailbox exists (only sending a code
 * can prove that). Instead we reject the two things that are cheaply checkable:
 *
 *  1. Malformed addresses (basic shape).
 *  2. Disposable / temporary-mail domains (10minutemail, mailinator, …) that
 *     people use to dodge verification.
 *
 * The blocklist below covers the most common throwaway providers. It is
 * intentionally a curated set rather than an exhaustive 10k-entry dump — that
 * keeps the bundle small while catching the overwhelming majority of abuse.
 * Add domains here as new ones show up.
 *
 * Returns i18n message keys (matching `auth.errors.*`) so callers stay
 * localized.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Known disposable / temporary email domains. Lowercase, no leading dot.
 * Subdomains are matched too (e.g. `foo.mailinator.com`).
 */
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  '0clock.net', '0wnd.net', '10minutemail.com', '10minutemail.net', '20minutemail.com',
  '33mail.com', '3dxtras.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamailblock.com', 'sharklasers.com',
  'grr.la', 'spam4.me', 'mailinator.com', 'mailinator.net', 'mailinator2.com',
  'mailnesia.com', 'maildrop.cc', 'mailcatch.com', 'dispostable.com', 'trashmail.com',
  'trashmail.net', 'trashmail.me', 'trash-mail.com', 'wegwerfmail.de', 'tempmail.com',
  'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'tempmail.net', 'tempr.email',
  'tempinbox.com', 'throwawaymail.com', 'throwaway.email', 'getnada.com', 'nada.email',
  'getairmail.com', 'fakemail.net', 'fakeinbox.com', 'yopmail.com', 'yopmail.net',
  'yopmail.fr', 'cool.fr.nf', 'jetable.org', 'jetable.com', 'mytemp.email',
  'mohmal.com', 'emailondeck.com', 'mailsac.com', 'inboxbear.com', 'tempmailaddress.com',
  'discard.email', 'discardmail.com', 'spambox.us', 'spambog.com', 'mt2015.com',
  'mailtemp.net', 'minuteinbox.com', 'inboxkitten.com', 'burnermail.io', 'emltmp.com',
  'luxusmail.org', 'tmail.tm', 'tmailor.com', '1secmail.com', '1secmail.org',
  '1secmail.net', 'kzcdn.com', 'moakt.com', 'tafmail.com', 'vintomaper.com',
]);

export type EmailRuleKey = 'emailInvalid' | 'emailDisposable';

/** Extract the lowercased domain portion of an email address. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

/** True if the domain (or any parent domain) is a known disposable provider. */
export function isDisposableDomain(domain: string): boolean {
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Match subdomains: a.b.mailinator.com → check b.mailinator.com, mailinator.com.
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

/**
 * Validate an email's shape and reject disposable domains.
 * Returns an `auth.errors.*` key on failure, or `null` when the address is ok.
 */
export function validateEmailAddress(email: string): EmailRuleKey | null {
  if (!EMAIL_RE.test(email)) return 'emailInvalid';
  if (isDisposableDomain(emailDomain(email))) return 'emailDisposable';
  return null;
}

/**
 * Shared Turnstile constants used by BOTH the client widget and the server
 * verifier. Kept in a plain module (no `server-only` / `use client`) so either
 * side can import it without pulling in the other's runtime.
 */

/**
 * Value submitted as the captcha response when the client could not run
 * Turnstile at all (script failed to load, widget errored, or it timed out).
 *
 * The server accepts this marker ONLY when Cloudflare itself is unreachable, so
 * it degrades gracefully during a real outage without becoming a blanket bot
 * bypass while Turnstile is healthy.
 */
export const TURNSTILE_UNAVAILABLE = 'unavailable';

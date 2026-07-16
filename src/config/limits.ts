/**
 * Anti-spam / rate-limit configuration.
 *
 * Single source of truth for both the client-side throttle (escalating delay +
 * "please wait" popup) and the matching server-side hard limits enforced in the
 * database. Keep the client window/limits at or below the server values so the
 * UI warns before the server ever rejects.
 *
 * Durations are in milliseconds on the client; the SQL functions use the
 * second-based equivalents (see migration 20260621000028).
 */
export const rateLimits = {
  /** Direct + group messages. */
  message: {
    windowMs: 10_000,
    /** Sends within the window before we start adding delay. */
    softMax: 5,
    /** Hard ceiling within the window — beyond this we block + show popup. */
    hardMax: 15,
    /** Added per message once past softMax (escalating). */
    stepMs: 400,
    /** Cap on the escalating per-message delay. */
    maxDelayMs: 4_000,
    /** Cool-down shown in the popup once the hard cap is hit. */
    blockMs: 8_000,
  },
} as const;

export type RateLimitKey = keyof typeof rateLimits;

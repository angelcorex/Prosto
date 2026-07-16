/**
 * Age helpers for the NSFW / age-restriction feature.
 *
 * A user is an adult (may view age-restricted content) only when they have a
 * stored birth date that is at least {@link ADULT_AGE} years in the past. No
 * birth date → treated as not an adult (gated), which also drives the
 * one-time birth-date prompt for legacy accounts.
 */

/** Minimum age to access NSFW / age-restricted content. */
export const ADULT_AGE = 18;
/** Minimum age to hold an account at all (matches the set_birth_date RPC). */
export const MIN_SIGNUP_AGE = 13;

/** Whole years between `birthDate` and now (null/invalid → null). */
export function ageFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

/** True when the birth date is present and the user is {@link ADULT_AGE}+. */
export function isAdultFromBirthDate(birthDate: string | null | undefined): boolean {
  const age = ageFromBirthDate(birthDate);
  return age != null && age >= ADULT_AGE;
}

/** Latest birth date (as `yyyy-mm-dd`) that still satisfies the minimum age. */
export function maxBirthDateFor(minAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().slice(0, 10);
}

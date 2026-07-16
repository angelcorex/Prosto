/**
 * Auth input validation.
 *
 * Returns i18n message keys (matching `auth.errors.*` in the locale files)
 * rather than hardcoded strings, so field errors are always localized.
 *
 * Username format rules live in username-rules.ts — this file only does
 * the presence check needed for the server action.
 */

export const PASSWORD_MIN_LENGTH = 10;

import { validateEmailAddress } from './email-rules';

export type FieldErrors = {
  email?: string;
  password?: string;
  username?: string;
  currentPassword?: string;
  confirmPassword?: string;
  agree?: string;
  birthDate?: string;
};

export function validateCredentials(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};

  if (!email) {
    errors.email = 'emailRequired';
  } else {
    const emailError = validateEmailAddress(email);
    if (emailError) errors.email = emailError;
  }

  if (!password) {
    errors.password = 'passwordRequired';
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = 'passwordTooShort';
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

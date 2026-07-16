import type { FieldErrors } from './validation';

/**
 * Return shape for auth server actions, consumed by `useActionState` in the
 * forms. On success the action redirects, so a resolved state always
 * represents some kind of error or informational message.
 */
export type AuthFormState = {
  fieldErrors?: FieldErrors;
  formError?: string;
  message?: string;
  /** Code-login flow: which step the form should render next. */
  step?: 'email' | 'code';
  /** Email carried between steps of the code-login / reset flows. */
  email?: string;
};

export const initialAuthState: AuthFormState = {};

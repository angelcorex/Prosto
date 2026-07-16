/** Public, client-safe view of a stored account (never includes tokens). */
export interface AccountSummary {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_premium: boolean;
  is_moderator: boolean;
}

/**
 * Result state for the add/register account forms (consumed by `useActionState`
 * in the modal). `fieldErrors` values are i18n keys under `auth.errors`.
 */
export type AddAccountState = {
  /** Set once the account was added/registered and is now active. */
  ok?: boolean;
  error?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
    username?: string;
    agree?: string;
  };
};

/**
 * Shared, cross-feature types. Feature-local domain types belong in the
 * respective `features/<name>/types.ts`.
 */

/** A value that is still loading, resolved, or failed. */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

/** Standard shape for paginated results. */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** Make every property optional and nullable (useful for partial updates). */
export type Nullable<T> = { [K in keyof T]: T[K] | null };

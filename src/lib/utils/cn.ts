import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with conflict resolution.
 *
 * `clsx` handles conditional/array/object class inputs; `tailwind-merge`
 * resolves conflicting Tailwind utilities (e.g. `p-2 p-4` -> `p-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

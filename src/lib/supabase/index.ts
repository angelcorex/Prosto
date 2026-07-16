/**
 * Supabase integration entry point.
 *
 * Import the specific client for the runtime you are in:
 *  - `createClient` from `./client`  -> Client Components
 *  - `createClient` from `./server`  -> Server Components / Actions / Handlers
 *
 * These are intentionally not re-exported together to avoid accidentally
 * importing the server client (which uses `next/headers`) into the browser
 * bundle. Import directly from the correct file instead.
 */

export type { Database, Json } from './database.types';

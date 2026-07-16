/** Shared shapes for the admin panel, mirroring the admin_* RPC returns. */

export interface AdminStats {
  total_users: number;
  new_7d: number;
  new_30d: number;
  dau: number;
  wau: number;
  mau: number;
  online: number;
  posts: number;
  messages: number;
  channel_messages: number;
  servers: number;
  moderators: number;
  premium: number;
}

export interface SignupPoint {
  day: string;   // ISO date
  count: number;
}

export interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_moderator: boolean;
  is_premium: boolean;
  is_admin: boolean;
  created_at: string;
  last_seen: string | null;
}

export interface DbTable {
  name: string;
  total_bytes: number;
  rows: number;
}

export interface DbHealth {
  postgres_version: string;
  db_size_bytes: number;
  connections_active: number;
  connections_max: number;
  cache_hit_ratio: number;   // 0..1
  db_started_at: string;
  now: string;
  tables: DbTable[];
}

export type AppEventLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppEvent {
  id: number;
  level: AppEventLevel;
  kind: string;
  message: string;
  user_id: string | null;
  path: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

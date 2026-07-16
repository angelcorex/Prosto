/** Shared types for the developer portal. */

export interface BotTokenRow {
  id: string;
  token_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface BotCommandRow {
  id: string;
  name: string;
  description: string;
  options: BotCommandOption[];
}

export interface BotCommandOption {
  name: string;
  description?: string;
  type?: 'string' | 'integer' | 'boolean' | 'user';
  required?: boolean;
}

export interface BotServerRow {
  id: string;
  name: string;
  icon_url: string | null;
  public_id: string;
}

export interface BotDetail {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  tokens: BotTokenRow[];
  commands: BotCommandRow[];
  memberServers: BotServerRow[];
  /** Servers the owner controls that the bot is NOT yet in (add candidates). */
  ownerServers: BotServerRow[];
}

/** Public types for the Prosto bot SDK. */

export type OptionType = 'string' | 'integer' | 'boolean' | 'user';

export interface CommandOption {
  name: string;
  description?: string;
  type?: OptionType;
  required?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  options?: CommandOption[];
}

export interface ProstoBotOptions {
  /** The bot token from the developer portal (pb_…). */
  token: string;
  /** API base URL. Defaults to https://prosto.ink. */
  baseUrl?: string;
  /** Long-poll wait window in seconds (0–30). Defaults to 25. */
  pollWait?: number;
  /** Max interactions per poll batch (1–50). Defaults to 10. */
  pollLimit?: number;
  /** Called on unhandled errors in the poll loop / handlers. */
  onError?: (err: unknown) => void;
}

export interface Interaction {
  id: string;
  command: string;
  responseToken: string;
  scope: 'channel' | 'dm';
  channelId: string | null;
  conversationId: string | null;
  serverId: string | null;
  options: Record<string, unknown>;
  invoker: { id: string; username: string };
  createdAt: string;
}

export interface SendMessageInput {
  channelId?: string;
  conversationId?: string;
  content: string;
  replyTo?: string;
}

export interface BotIdentity {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

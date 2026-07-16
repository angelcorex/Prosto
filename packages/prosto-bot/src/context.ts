import type { ApiClient } from './client.js';
import type { Interaction } from './types.js';

/**
 * The handler context for one slash-command interaction. Wraps the raw
 * interaction with convenience accessors and a `reply` that answers it.
 */
export class InteractionContext {
  constructor(private api: ApiClient, public interaction: Interaction) {}

  get command(): string { return this.interaction.command; }
  get scope(): 'channel' | 'dm' { return this.interaction.scope; }
  get channelId(): string | null { return this.interaction.channelId; }
  get conversationId(): string | null { return this.interaction.conversationId; }
  get serverId(): string | null { return this.interaction.serverId; }
  get invoker(): { id: string; username: string } { return this.interaction.invoker; }
  get options(): Record<string, unknown> { return this.interaction.options; }

  /** Read a single submitted option value. */
  option<T = string>(name: string): T | undefined {
    return this.interaction.options[name] as T | undefined;
  }

  /** Answer the interaction — posts `content` to where the command was run. */
  reply(content: string): Promise<{ ok: true }> {
    return this.api.respond(this.interaction.responseToken, content);
  }
}

export type CommandHandler = (ctx: InteractionContext) => void | Promise<void>;

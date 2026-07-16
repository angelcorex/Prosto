import { ApiClient, sleep } from './client.js';
import { InteractionContext, type CommandHandler } from './context.js';
import type {
  ProstoBotOptions, CommandDefinition, CommandOption, SendMessageInput, BotIdentity, Interaction,
} from './types.js';

interface Registered extends CommandDefinition {
  handler: CommandHandler;
}

/**
 * The Prosto bot. Register commands with `command()`, then `start()` to begin
 * the long-poll loop: the bot syncs its commands, then repeatedly fetches
 * pending interactions and dispatches each to its handler.
 *
 *   const bot = new ProstoBot({ token: process.env.PROSTO_BOT_TOKEN! });
 *   bot.command('ping', 'Health check', (ctx) => ctx.reply('Pong 🏓'));
 *   bot.start();
 */
export class ProstoBot {
  private api: ApiClient;
  private commands = new Map<string, Registered>();
  private running = false;
  private wait: number;
  private limit: number;
  private onError: (err: unknown) => void;

  constructor(opts: ProstoBotOptions) {
    if (!opts.token) throw new Error('ProstoBot: `token` is required.');
    const baseUrl = (opts.baseUrl ?? 'https://prosto.ink').replace(/\/+$/, '');
    this.api = new ApiClient(opts.token, baseUrl);
    this.wait = Math.min(30, Math.max(0, opts.pollWait ?? 25));
    this.limit = Math.min(50, Math.max(1, opts.pollLimit ?? 10));
    this.onError = opts.onError ?? ((e) => console.error('[prosto-bot]', e));
  }

  /**
   * Register a slash command. Overloads:
   *   command(name, description, handler)
   *   command(name, description, { options }, handler)
   */
  command(name: string, description: string, handler: CommandHandler): this;
  command(name: string, description: string, opts: { options?: CommandOption[] }, handler: CommandHandler): this;
  command(
    name: string,
    description: string,
    third: CommandHandler | { options?: CommandOption[] },
    fourth?: CommandHandler,
  ): this {
    const handler = (typeof third === 'function' ? third : fourth) as CommandHandler;
    const options = typeof third === 'function' ? undefined : third.options;
    if (!handler) throw new Error(`ProstoBot: no handler for command "${name}".`);
    this.commands.set(name, { name, description, options, handler });
    return this;
  }

  /** Fetch the bot's own identity (a startup health check). */
  me(): Promise<{ ok: true; bot: BotIdentity }> {
    return this.api.me();
  }

  /** Send a message directly to a channel or conversation. */
  sendMessage(input: SendMessageInput) {
    return this.api.sendMessage(input);
  }

  /** Push the registered command definitions to Prosto (declarative sync). */
  async syncCommands(): Promise<void> {
    const defs: CommandDefinition[] = [...this.commands.values()].map(({ name, description, options }) => ({
      name, description, options,
    }));
    await this.api.syncCommands(defs);
  }

  /** Begin the long-poll loop. Resolves only when `stop()` is called. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.syncCommands();
    } catch (err) {
      this.onError(err);
    }

    while (this.running) {
      try {
        const { interactions } = await this.api.poll(this.wait, this.limit);
        for (const it of interactions) {
          void this.dispatch(it);
        }
      } catch (err) {
        this.onError(err);
        // Back off briefly so a transient failure doesn't hot-loop.
        await sleep(2000);
      }
    }
  }

  /** Stop the poll loop. */
  stop(): void {
    this.running = false;
  }

  private async dispatch(it: Interaction): Promise<void> {
    const cmd = this.commands.get(it.command);
    const ctx = new InteractionContext(this.api, it);
    if (!cmd) {
      // Unknown command — acknowledge so it doesn't hang for the user.
      await ctx.reply(`Unknown command: /${it.command}`).catch(() => {});
      return;
    }
    try {
      await cmd.handler(ctx);
    } catch (err) {
      this.onError(err);
      await ctx.reply('Something went wrong handling that command.').catch(() => {});
    }
  }
}

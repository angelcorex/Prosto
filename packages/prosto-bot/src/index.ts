/**
 * prosto-bot — the official SDK for building bots on Prosto.
 *
 *   import { ProstoBot } from 'prosto-bot';
 *
 *   const bot = new ProstoBot({ token: process.env.PROSTO_BOT_TOKEN! });
 *   bot.command('ping', 'Health check', (ctx) => ctx.reply('Pong 🏓'));
 *   bot.start();
 */
export { ProstoBot } from './bot.js';
export { InteractionContext, type CommandHandler } from './context.js';
export { ProstoApiError } from './client.js';
export type {
  ProstoBotOptions, CommandDefinition, CommandOption, OptionType,
  Interaction, SendMessageInput, BotIdentity,
} from './types.js';

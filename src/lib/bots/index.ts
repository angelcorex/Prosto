import 'server-only';

/** Server-only bot platform primitives: token crypto, API auth, JSON helpers. */
export { generateToken, hashSecret, parseToken, verifySecret } from './token';
export type { GeneratedToken, ParsedToken } from './token';
export { authenticateBot } from './auth';
export type { BotIdentity, BotAuthResult } from './auth';
export { apiOk, apiError, rpcError } from './api';

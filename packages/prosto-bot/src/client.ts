import type { CommandDefinition, Interaction, SendMessageInput, BotIdentity } from './types.js';

/** Thrown when the API returns a non-2xx response. */
export class ProstoApiError extends Error {
  constructor(public status: number, public code: string) {
    super(`Prosto API error ${status}: ${code}`);
    this.name = 'ProstoApiError';
  }
}

/**
 * Thin fetch wrapper over the Prosto bot REST API. Handles auth headers, JSON
 * envelopes, and 429 back-off. Stateless — the ProstoBot class drives it.
 */
export class ApiClient {
  constructor(private token: string, private baseUrl: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      // Honour Retry-After on 429 (a few times) so callers don't have to.
      if (res.status === 429 && attempt < 5) {
        const retry = Number(res.headers.get('Retry-After')) || 2;
        await sleep(retry * 1000);
        continue;
      }

      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.ok === false) {
        throw new ProstoApiError(res.status, String(json.error ?? 'unknown_error'));
      }
      return json as T;
    }
  }

  me(): Promise<{ ok: true; bot: BotIdentity }> {
    return this.request('GET', '/api/v1/me');
  }

  syncCommands(commands: CommandDefinition[]): Promise<{ ok: true; commands: CommandDefinition[] }> {
    return this.request('PUT', '/api/v1/commands', { commands });
  }

  poll(wait: number, limit: number): Promise<{ ok: true; interactions: Interaction[] }> {
    return this.request('GET', `/api/v1/interactions?wait=${wait}&limit=${limit}`);
  }

  respond(responseToken: string, content: string): Promise<{ ok: true }> {
    return this.request('POST', `/api/v1/interactions/${responseToken}/respond`, { content });
  }

  sendMessage(input: SendMessageInput): Promise<{ ok: true; message: { id: string; createdAt: string } }> {
    return this.request('POST', '/api/v1/messages', input);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

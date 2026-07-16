'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import type { EmojiInputHandle } from './emoji-input';
import { AvatarImage } from './avatar-image';

/**
 * Inline, Discord-style slash commands. Instead of a separate popover, the user
 * types `/` directly in the composer: a command picker appears, choosing one
 * writes `/name ` into the field, and an argument-signature hint highlights the
 * option you're currently filling. Pressing Enter parses the line and creates a
 * bot interaction (the bot's reply arrives as a normal message).
 *
 * Self-contained: talks to `get_available_commands` / `create_interaction`
 * directly (both granted to `authenticated`, authorize internally), so it plugs
 * into any composer via a handful of hooks (`onInput`, `onKeyDown`, `maybeSubmit`).
 */

interface CommandOption {
  name: string;
  description?: string;
  type?: string;
  required?: boolean;
}
interface AvailableCommand {
  bot_id: string;
  bot_username: string;
  bot_display_name: string | null;
  bot_avatar_url: string | null;
  command_name: string;
  description: string;
  options: CommandOption[];
}

type SlashState =
  | { mode: 'list'; query: string }
  | { mode: 'args'; cmd: AvailableCommand; argIndex: number }
  | null;

export interface SlashLabels {
  title?: string;
  empty?: string;
  failed?: string;
  missing?: (name: string) => string;
  /** Bot lacks Send Messages in this channel (rejected up front). */
  botCannotSend?: string;
  /** Bot isn't reachable here (left the server / not a DM participant). */
  botUnavailable?: string;
  /** Too many commands too fast. */
  rateLimited?: string;
}

export interface UseSlashCommandsOptions {
  scope: 'channel' | 'dm';
  channelId?: string;
  conversationId?: string;
  textRef: React.RefObject<EmojiInputHandle | null>;
  setCharCount: (n: number) => void;
  labels?: SlashLabels;
}

/** Split a `/cmd arg1 arg2…` line into its command token + trailing args text. */
function parseLine(value: string): { name: string; rest: string; hasSpace: boolean } | null {
  const m = value.match(/^\/([a-z0-9_-]*)(\s?)([\s\S]*)$/i);
  if (!m) return null;
  return { name: m[1] ?? '', rest: m[3] ?? '', hasSpace: !!m[2] };
}

/**
 * Map the free-text args onto a command's declared options. Positional: each
 * whitespace-separated token fills the next option, and the LAST option soaks
 * up the remainder so a final string arg can contain spaces (Discord-style).
 */
function mapArgs(cmd: AvailableCommand, rest: string): Record<string, string> {
  const opts = cmd.options ?? [];
  if (opts.length === 0) return {};
  const out: Record<string, string> = {};
  const trimmed = rest.replace(/^\s+/, '');
  if (opts.length === 1) {
    if (trimmed) out[opts[0]!.name] = trimmed;
    return out;
  }
  const parts = trimmed.length ? trimmed.split(/\s+/) : [];
  opts.forEach((o, i) => {
    if (i < opts.length - 1) {
      if (parts[i] != null) out[o.name] = parts[i]!;
    } else {
      const tail = parts.slice(i).join(' ');
      if (tail) out[o.name] = tail;
    }
  });
  return out;
}

export function useSlashCommands({
  scope,
  channelId,
  conversationId,
  textRef,
  setCharCount,
  labels,
}: UseSlashCommandsOptions) {
  const [commands, setCommands] = useState<AvailableCommand[] | null>(null);
  const [state, setState] = useState<SlashState>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  // Kept in a ref so the send handler can read commands synchronously.
  const commandsRef = useRef<AvailableCommand[] | null>(null);

  const load = useCallback(async () => {
    if (commandsRef.current || loadingRef.current) return;
    loadingRef.current = true;
    const sb = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).rpc('get_available_commands', {
      p_scope: scope,
      p_channel: scope === 'channel' ? channelId : null,
      p_conversation: scope === 'dm' ? conversationId : null,
    });
    const list = (data ?? []) as AvailableCommand[];
    commandsRef.current = list;
    setCommands(list);
    loadingRef.current = false;
  }, [scope, channelId, conversationId]);

  /** Re-evaluate slash state from the current input value + caret. */
  const detect = useCallback((el: EmojiInputHandle) => {
    const value = el.value;
    setError(null);
    const parsed = parseLine(value);
    if (!parsed) { setState((s) => (s ? null : s)); return; }
    void load();
    if (!parsed.hasSpace) {
      // Still typing the command name → show the picker.
      setState({ mode: 'list', query: parsed.name });
      setIdx(0);
      return;
    }
    // Past the command name → show the argument-signature hint for that command.
    const cmd = (commandsRef.current ?? []).find((c) => c.command_name === parsed.name);
    if (!cmd) { setState({ mode: 'list', query: parsed.name }); setIdx(0); return; }
    // Which arg the caret is on: count whitespace-separated tokens typed so far.
    const typed = parsed.rest.replace(/^\s+/, '');
    const tokenCount = typed.length ? typed.split(/\s+/).length : 0;
    const trailingSpace = /\s$/.test(parsed.rest);
    const argIndex = Math.max(0, Math.min((typed ? tokenCount - 1 : 0) + (trailingSpace ? 1 : 0), Math.max(0, cmd.options.length - 1)));
    setState({ mode: 'args', cmd, argIndex });
  }, [load]);

  const items = useMemo(() => {
    if (!state || state.mode !== 'list' || !commands) return [] as AvailableCommand[];
    const q = state.query.toLowerCase();
    return commands.filter((c) => c.command_name.toLowerCase().includes(q)).slice(0, 8);
  }, [state, commands]);

  const close = useCallback(() => { setState(null); setError(null); }, []);

  /** Write `/name ` into the field and switch to the argument hint. */
  const applyPick = useCallback((cmd: AvailableCommand) => {
    const el = textRef.current;
    if (!el) return;
    const hasArgs = (cmd.options?.length ?? 0) > 0;
    const insert = `/${cmd.command_name}${hasArgs ? ' ' : ''}`;
    el.value = insert;
    el.setSelectionRange(insert.length, insert.length);
    el.focus();
    setCharCount(el.value.length);
    // Either way land in "args" mode: with options it shows the signature hint;
    // with none it just shows "/name" so Enter runs it (maybeSubmit handles it).
    setState({ mode: 'args', cmd, argIndex: 0 });
  }, [textRef, setCharCount]);

  async function run(cmd: AvailableCommand, opts: Record<string, string>): Promise<boolean> {
    const sb = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (sb as any).rpc('create_interaction', {
      p_bot: cmd.bot_id,
      p_command: cmd.command_name,
      p_scope: scope,
      p_channel: scope === 'channel' ? channelId : null,
      p_conversation: scope === 'dm' ? conversationId : null,
      p_options: opts,
    });
    if (err) {
      // Turn the RPC's machine code into an ephemeral, human reason so the user
      // isn't left guessing why nothing happened. bot_cannot_send is the common
      // one: the bot lacks Send Messages in this channel (see create_interaction).
      const m = (err.message || '').toLowerCase();
      const reason =
        m.includes('bot_cannot_send') ? labels?.botCannotSend
        : m.includes('bot_not_in_server') || m.includes('bot_not_in_dm') || m.includes('bot_unavailable') ? labels?.botUnavailable
        : m.includes('rate') ? labels?.rateLimited
        : null;
      setError(reason ?? labels?.failed ?? "Couldn't run command.");
      return false;
    }
    return true;
  }

  /**
   * Called by the composer BEFORE it sends a normal message. If the field holds
   * a valid slash command, this fires the interaction, clears the field, and
   * returns true so the composer skips its own send. Otherwise returns false.
   */
  const maybeSubmit = useCallback(async (): Promise<boolean> => {
    const el = textRef.current;
    if (!el) return false;
    const parsed = parseLine(el.value.trim());
    if (!parsed) return false;
    const cmd = (commandsRef.current ?? []).find((c) => c.command_name === parsed.name);
    if (!cmd) {
      // Looks like a slash command but no bot here has it → surface, don't send.
      setError(labels?.empty ?? 'No such command here.');
      return true;
    }
    const opts = mapArgs(cmd, parsed.rest);
    for (const o of cmd.options ?? []) {
      if (o.required && !opts[o.name]?.trim()) {
        setState({ mode: 'args', cmd, argIndex: cmd.options.findIndex((x) => x.name === o.name) });
        setError((labels?.missing ?? ((n) => `Missing required: ${n}`))(o.name));
        return true;
      }
    }
    const ok = await run(cmd, opts);
    if (ok) {
      el.value = '';
      el.style.height = 'auto';
      setCharCount(0);
      close();
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textRef, setCharCount, close, labels]);

  /** Intercept navigation keys while the picker is open. Returns true if handled. */
  const onKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (!state) return false;
    if (e.key === 'Escape') { e.preventDefault(); close(); return true; }
    if (state.mode === 'list' && items.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => (i + 1) % items.length); return true; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => (i - 1 + items.length) % items.length); return true; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyPick(items[idx] ?? items[0]!); return true; }
    }
    // In args mode Enter falls through to the composer, which calls maybeSubmit.
    return false;
  }, [state, items, idx, applyPick, close]);

  /** Slash toolbar button: prime the field with `/` and open the picker. */
  const trigger = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    if (!el.value.trim()) {
      el.value = '/';
      el.setSelectionRange(1, 1);
    }
    el.focus();
    void load();
    setState({ mode: 'list', query: parseLine(el.value)?.name ?? '' });
    setIdx(0);
  }, [textRef, load]);

  const active = state != null;

  const ui = active ? (
    <div className="surface-solid mb-1 overflow-hidden rounded-xl shadow-2xl ring-1 ring-border/40">
      {state?.mode === 'list' ? (
        <>
          <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
            {labels?.title ?? 'Commands'}
          </p>
          {commands == null ? (
            <p className="px-3 py-3 text-center text-sm text-muted-foreground/60">…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-3 text-center text-sm text-muted-foreground/60">{labels?.empty ?? 'No bot commands here yet.'}</p>
          ) : (
            items.map((c, i) => (
              <button
                key={`${c.bot_id}:${c.command_name}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applyPick(c); }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                  i === idx ? 'bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {c.bot_avatar_url
                    ? <AvatarImage src={c.bot_avatar_url} alt="" sizes="24px" className="object-cover" />
                    : (c.bot_username[0] ?? '?').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  /{c.command_name}
                  {(c.options?.length ?? 0) > 0 && (
                    <span className="ml-1 text-[12px] font-normal text-muted-foreground/50">
                      {c.options.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(' ')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] text-muted-foreground/60">{c.description || `@${c.bot_username}`}</span>
              </button>
            ))
          )}
        </>
      ) : state?.mode === 'args' ? (
        <div className="px-3 py-2">
          <p className="text-[13px]">
            <span className="font-semibold">/{state.cmd.command_name}</span>{' '}
            {state.cmd.options.map((o, i) => (
              <span key={o.name} className={cn('mr-1 text-[12px]', i === state.argIndex ? 'font-bold text-foreground' : 'text-muted-foreground/50')}>
                {o.required ? `<${o.name}>` : `[${o.name}]`}
              </span>
            ))}
          </p>
          {state.cmd.options[state.argIndex] && (
            <p className="mt-0.5 text-[12px] text-muted-foreground/70">
              <span className="font-medium text-foreground/80">{state.cmd.options[state.argIndex]!.name}</span>
              {state.cmd.options[state.argIndex]!.description ? ` — ${state.cmd.options[state.argIndex]!.description}` : ''}
              {state.cmd.options[state.argIndex]!.required ? ' *' : ''}
            </p>
          )}
        </div>
      ) : null}
      {error && <p className="border-t border-border/40 px-3 py-1.5 text-[12px] text-destructive">{error}</p>}
    </div>
  ) : null;

  return { active, ui, detect, onKeyDown, maybeSubmit, trigger, close };
}


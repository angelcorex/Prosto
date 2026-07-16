'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils/cn';
import { MiniProfilePopup, CustomEmoji, parseEmojiToken, CUSTOM_EMOJI_SRC, UNICODE_EMOJI_SRC } from '@/components/ui';
import { twemojiUrl } from '@/lib/utils/twemoji';

/**
 * Discord-flavoured message formatting — used ONLY for DM/group message bodies.
 * Dependency-free: a small block splitter + a recursive inline parser.
 *
 * Supported: bold, italic, bold italic, underline, strike, spoiler,
 * inline code, fenced code blocks, quotes, headers, subtext, lists, links
 * and coloured text. See FormattingHelp for the exact syntax shown to users.
 */

const COLORS: Record<string, string> = {
  red: 'text-red-400', orange: 'text-orange-400', yellow: 'text-yellow-400',
  green: 'text-green-400', blue: 'text-blue-400', purple: 'text-purple-400',
  pink: 'text-pink-400', gray: 'text-gray-400', grey: 'text-gray-400',
};

/* ── Lightweight, language-agnostic code highlighting ── */
const CODE_RE =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(\b(?:function|return|const|let|var|if|else|elif|for|while|class|def|import|from|export|default|new|await|async|true|false|null|none|public|private|void|print|console|self|lambda|try|except|finally|switch|case|break|continue|interface|type|enum)\b)/gi;

function highlightCode(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const cls = m[1] ? 'text-muted-foreground/60 italic'
      : m[2] ? 'text-green-400'
      : m[3] ? 'text-orange-400'
      : 'text-purple-400';
    out.push(<span key={`h${k++}`} className={cls}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/* ── Inline parser (recursive, earliest-match wins) ── */
type Rule = { re: RegExp; render: (m: RegExpMatchArray, key: string) => ReactNode };

const RULES: Rule[] = [
  // Escape: a backslash before an emoji/shortcode renders it as raw text
  // (Discord-style "copy the code"). Listed first so it wins the earliest-match.
  { re: new RegExp('\\\\(' + CUSTOM_EMOJI_SRC + '|:[a-z0-9_]{2,32}:|' + UNICODE_EMOJI_SRC + ')', 'iu'), render: (m, k) => <span key={k}>{m[1]}</span> },
  { re: /`([^`\n]+)`/, render: (m, k) => <code key={k} className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[12.5px]">{m[1]}</code> },
  // Custom server emoji token: <:name:id> / <a:name:id> (id or legacy url).
  { re: /<(a)?:([a-z0-9_]{2,32}):([^\s>]+)>/i, render: (m, k) => (
      <CustomEmoji key={k} name={m[2]!} payload={m[3]!} animated={!!m[1]} interactive />
    ) },
  { re: /\|\|([\s\S]+?)\|\|/, render: (m, k) => <Spoiler key={k}>{inline(m[1] ?? '')}</Spoiler> },
  { re: /\[c=(\w+)\]([\s\S]+?)\[\/c\]/, render: (m, k) => <span key={k} className={COLORS[(m[1] ?? '').toLowerCase()] ?? ''}>{inline(m[2] ?? '')}</span> },
  { re: /\*\*\*([\s\S]+?)\*\*\*/, render: (m, k) => <strong key={k} className="italic">{inline(m[1] ?? '')}</strong> },
  { re: /\*\*([\s\S]+?)\*\*/, render: (m, k) => <strong key={k}>{inline(m[1] ?? '')}</strong> },
  { re: /__([\s\S]+?)__/, render: (m, k) => <u key={k}>{inline(m[1] ?? '')}</u> },
  { re: /~~([\s\S]+?)~~/, render: (m, k) => <s key={k}>{inline(m[1] ?? '')}</s> },
  { re: /\*([\s\S]+?)\*/, render: (m, k) => <em key={k}>{inline(m[1] ?? '')}</em> },
  { re: /_([\s\S]+?)_/, render: (m, k) => <em key={k}>{inline(m[1] ?? '')}</em> },
  { re: /(?<![\w@])@(everyone|here|[a-z0-9_]{2,32})/i, render: (m, k) => {
      const name = m[1] ?? '';
      if (/^(everyone|here)$/i.test(name)) {
        return <span key={k} className="rounded-[4px] bg-link/20 px-1 py-px font-semibold text-link">@{name}</span>;
      }
      return (
        <MiniProfilePopup key={k} user={{ username: name }} className="inline">
          <span className="cursor-pointer rounded-[4px] bg-link/20 px-1 py-px font-semibold text-link transition-colors hover:bg-link/30">@{name}</span>
        </MiniProfilePopup>
      );
    } },
  { re: /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/, render: (m, k) => <Anchor key={k} href={m[2] ?? '#'}>{m[1]}</Anchor> },
  { re: /(https?:\/\/[^\s<]+)/, render: (m, k) => <Anchor key={k} href={m[1] ?? '#'}>{m[1]}</Anchor> },
  // Unicode emoji → Twemoji image (flags via explicit Regional-Indicator range).
  { re: /([\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(\uFE0F)?(\u200D\p{Extended_Pictographic}(\uFE0F)?)*(\u20E3)?)/u, render: (m, k) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={k} src={twemojiUrl(m[0])} alt={m[0]} decoding="async" className="inline-block h-[1.5em] w-[1.5em] align-[-0.3em] object-contain" draggable={false} />
    ) },
];

/** Matches custom emoji tokens + any Unicode emoji (for jumbo detection). */
const EMOJI_TOKEN_G = new RegExp(CUSTOM_EMOJI_SRC + '|' + UNICODE_EMOJI_SRC, 'gu');

function jumboEmoji(token: string, key: string): ReactNode {
  const p = parseEmojiToken(token);
  if (p) {
    return <CustomEmoji key={key} name={p.name} payload={p.payload} animated={p.animated} interactive jumbo />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={key} src={twemojiUrl(token)} alt={token} decoding="async" className="inline-block h-11 w-11 object-contain" draggable={false} />;
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest.length > 0) {
    let best: { rule: Rule; m: RegExpMatchArray } | null = null;
    for (const rule of RULES) {
      const m = rest.match(rule.re);
      if (m && m.index != null && (!best || m.index < (best.m.index ?? Infinity))) {
        best = { rule, m };
      }
    }
    if (!best || best.m.index == null) { nodes.push(rest); break; }
    if (best.m.index > 0) nodes.push(rest.slice(0, best.m.index));
    nodes.push(best.rule.render(best.m, `n${i++}`));
    rest = rest.slice(best.m.index + best.m[0].length);
  }
  return nodes;
}

function Anchor({ href, children }: { href: string; children: ReactNode }) {
  const external = !href.startsWith('/');
  return external
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">{children}</a>
    : <Link href={href} className="text-link hover:underline">{children}</Link>;
}

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => e.key === 'Enter' && setRevealed(true)}
      className={cn(
        'rounded px-0.5 transition-colors',
        revealed ? 'bg-foreground/10' : 'cursor-pointer select-none bg-foreground/25 text-transparent',
      )}
    >
      {children}
    </span>
  );
}

/* ── Block-level parsing ── */
export function MessageText({ content, className, suffix }: { content: string; className?: string; suffix?: ReactNode }) {
  // Jumbo emoji: a message that is *only* emoji (≤ 12) renders them large.
  const trimmed = content.trim();
  const emojiMatches = trimmed.match(EMOJI_TOKEN_G) ?? [];
  if (emojiMatches.length > 0 && emojiMatches.length <= 12 && trimmed.replace(EMOJI_TOKEN_G, '').trim() === '') {
    return (
      <div className={cn('flex flex-wrap items-center gap-1 py-0.5', className)}>
        {emojiMatches.map((tok, i) => jumboEmoji(tok, `j${i}`))}
      </div>
    );
  }

  const blocks: ReactNode[] = [];
  const parts = content.split(/```/);
  let bk = 0;

  parts.forEach((part, idx) => {
    // Odd segments are fenced code blocks.
    if (idx % 2 === 1) {
      const nl = part.indexOf('\n');
      const firstLine = nl === -1 ? part : part.slice(0, nl);
      const hasLang = /^[a-z0-9+#-]{1,15}$/i.test(firstLine.trim()) && nl !== -1;
      const lang = hasLang ? firstLine.trim() : '';
      const code = hasLang ? part.slice(nl + 1) : part;
      blocks.push(
        <pre key={`c${bk++}`} className="my-1 overflow-x-auto rounded-lg bg-foreground/[0.06] p-3 font-mono text-[12.5px] leading-relaxed">
          {lang && <div className="mb-1 select-none text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">{lang}</div>}
          <code>{highlightCode(code.replace(/\n$/, ''))}</code>
        </pre>,
      );
      return;
    }
    if (!part) return;

    // Plain segment → per-line block handling.
    part.split('\n').forEach((line) => {
      const key = `l${bk++}`;
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        const lvl = m[1]!.length;
        const size = lvl === 1 ? 'text-[19px]' : lvl === 2 ? 'text-[17px]' : 'text-[15px]';
        blocks.push(<div key={key} className={cn('mt-1 font-bold leading-snug', size)}>{inline(m[2] ?? '')}</div>);
      } else if ((m = line.match(/^-#\s+(.*)$/))) {
        blocks.push(<div key={key} className="text-[12px] text-muted-foreground/70">{inline(m[1] ?? '')}</div>);
      } else if ((m = line.match(/^>\s?(.*)$/))) {
        blocks.push(<div key={key} className="border-l-2 border-foreground/25 pl-2.5 text-foreground/85">{inline(m[1] ?? '')}</div>);
      } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        blocks.push(<div key={key} className="flex gap-1.5 pl-1"><span className="select-none text-muted-foreground">•</span><span>{inline(m[1] ?? '')}</span></div>);
      } else if (line.trim() === '') {
        blocks.push(<div key={key} className="h-2" />);
      } else {
        blocks.push(<div key={key}>{inline(line)}</div>);
      }
    });
  });

  return <div className={cn('break-words text-[14px] leading-relaxed', className)}>{blocks}{suffix}</div>;
}

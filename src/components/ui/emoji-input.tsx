'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils/cn';
import { getEmojiById, fetchEmojiById } from '@/lib/emoji';

/* ─────────────────────────────────────────────────────────────────────────
 * Discord-style rich message input.
 *
 * A `contentEditable` surface that renders custom server emojis as inline image
 * chips (the `<a?:name:id>` token is kept in a data-attribute, so the id stays
 * invisible) while everything else — text, @mentions, **markdown**, unicode
 * emoji — stays as plain text, exactly like Discord's composer.
 *
 * It exposes a *textarea-compatible* imperative handle (`value`, `selectionStart`,
 * `selectionEnd`, `setSelectionRange`, `focus`, `scrollHeight`, `style`) so the
 * existing composer logic (drafts, mention autocomplete, typing, submit) keeps
 * working with minimal changes. Character offsets count a chip as the full
 * length of its token, so `value.slice(0, selectionStart)` stays consistent.
 *
 * On send, `value` returns the serialized text with chips turned back into
 * `<a?:name:id>` tokens; the message renderer then shows them as emoji. A
 * leading `\` before a token still escapes it to raw text (handled downstream).
 * ──────────────────────────────────────────────────────────────────────── */

export interface EmojiInputHandle {
  /** Serialized text (chips → `<a?:name:id>` tokens). Settable to re-render. */
  value: string;
  /** Caret offset within the serialized text (chip counts as token length). */
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** Place the caret at a serialized-text offset. */
  setSelectionRange(start: number, end?: number): void;
  focus(): void;
  blur(): void;
  readonly scrollHeight: number;
  readonly style: CSSStyleDeclaration;
  /** Insert text/token at the caret (used by the emoji picker). */
  insertAtCaret(text: string): void;
}

interface EmojiInputProps {
  className?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** Single-line mode (names, pronouns): Enter is ignored, newlines stripped. */
  singleLine?: boolean;
  'aria-invalid'?: boolean;
  /** Fired after any content change (typing, paste, chip insert). */
  onInput?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Fired on paste; if it calls preventDefault we skip the default text paste. */
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
}

const TOKEN_G = /<a?:[a-z0-9_]{2,32}:[^\s>]+>/gi;
const TOKEN_ONE = /^<(a)?:([a-z0-9_]{2,32}):([^\s>]+)>$/i;

/* ── Chip <img> for a custom emoji token ── */
function makeChip(token: string): HTMLImageElement | null {
  const m = token.match(TOKEN_ONE);
  if (!m) return null;
  const name = m[2]!;
  const payload = m[3]!;
  const img = document.createElement('img');
  img.className = 'ei-chip';
  img.dataset.token = token;
  img.alt = `:${name}:`;
  img.draggable = false;
  img.setAttribute('contenteditable', 'false');

  const isUrl = /^https?:\/\//i.test(payload);
  if (isUrl) {
    img.src = payload;
  } else {
    const cached = getEmojiById(payload);
    if (cached?.url) {
      img.src = cached.url;
    } else {
      // Resolve on demand (emoji from a server the viewer isn't in).
      void fetchEmojiById(payload).then((e) => { if (e?.url) img.src = e.url; });
    }
  }
  return img;
}

/** True if a node is a custom-emoji chip (an atomic, single-caret-unit image). */
function isChip(node: Node | null | undefined): node is HTMLElement {
  return (
    !!node &&
    node.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).tagName === 'IMG' &&
    !!(node as HTMLElement).dataset.token
  );
}

/** Length a node contributes to the serialized value. */
function nodeLen(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').length;
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (el.tagName === 'IMG' && el.dataset.token) return el.dataset.token.length;
    if (el.tagName === 'BR') return 1;
    let n = 0;
    el.childNodes.forEach((c) => { n += nodeLen(c); });
    return n;
  }
  return 0;
}

/** Serialize a node to its text contribution (chips → token, <br> → \n). */
function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (el.tagName === 'IMG' && el.dataset.token) return el.dataset.token;
    if (el.tagName === 'BR') return '\n';
    let s = '';
    el.childNodes.forEach((c) => { s += serializeNode(c); });
    // A block element inserted by the browser (rare — we keep the DOM flat)
    // implies a line break before its content.
    if (el.tagName === 'DIV' || el.tagName === 'P') s = '\n' + s;
    return s;
  }
  return '';
}

function serialize(root: HTMLElement): string {
  let out = '';
  root.childNodes.forEach((c) => { out += serializeNode(c); });
  // A leading break from a browser-wrapped first block is not meaningful.
  return out.replace(/^\n/, '');
}

/** Build DOM nodes (text + chips) for a serialized string. */
function buildNodes(text: string): Node[] {
  const nodes: Node[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_G.lastIndex = 0;
  while ((m = TOKEN_G.exec(text))) {
    if (m.index > last) nodes.push(document.createTextNode(text.slice(last, m.index)));
    const chip = makeChip(m[0]);
    if (chip) nodes.push(chip);
    else nodes.push(document.createTextNode(m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

/** Character offset of (node, offset) within the root's serialized text. */
function caretToOffset(root: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  let done = false;

  function rec(cur: Node): void {
    if (done) return;
    if (cur === node) {
      if (cur.nodeType === Node.TEXT_NODE) total += offset;
      else for (let i = 0; i < offset && i < cur.childNodes.length; i++) total += nodeLen(cur.childNodes[i]!);
      done = true;
      return;
    }
    if (cur.nodeType === Node.TEXT_NODE) { total += (cur.nodeValue ?? '').length; return; }
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement;
      if (el.tagName === 'IMG' && el.dataset.token) { total += el.dataset.token.length; return; }
      if (el.tagName === 'BR') { total += 1; return; }
      for (const c of Array.from(el.childNodes)) { rec(c); if (done) return; }
    }
  }

  if (node === root) {
    for (let i = 0; i < offset && i < root.childNodes.length; i++) total += nodeLen(root.childNodes[i]!);
    return total;
  }
  for (const c of Array.from(root.childNodes)) { rec(c); if (done) break; }
  return total;
}

/** Locate the DOM (node, offset) for a serialized-text offset. */
function offsetToCaret(root: HTMLElement, target: number): { node: Node; offset: number } {
  let remaining = target;
  let result: { node: Node; offset: number } | null = null;

  function rec(cur: Node): void {
    if (result) return;
    if (cur.nodeType === Node.TEXT_NODE) {
      const len = (cur.nodeValue ?? '').length;
      if (remaining <= len) { result = { node: cur, offset: remaining }; return; }
      remaining -= len;
      return;
    }
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement;
      if (el.tagName === 'IMG' && el.dataset.token) {
        const len = el.dataset.token.length;
        // Snap to the side of the chip nearest the target.
        if (remaining <= 0) { result = caretBeside(el, true); return; }
        if (remaining < len) { result = caretBeside(el, false); return; }
        remaining -= len;
        return;
      }
      if (el.tagName === 'BR') {
        if (remaining <= 0) { result = caretBeside(el, true); return; }
        remaining -= 1;
        return;
      }
      for (const c of Array.from(el.childNodes)) { rec(c); if (result) return; }
    }
  }

  for (const c of Array.from(root.childNodes)) { rec(c); if (result) break; }
  if (result) return result;
  // Past the end → place at the very end of the root.
  return { node: root, offset: root.childNodes.length };
}

/** A caret position just before/after a non-text node, via its parent. */
function caretBeside(el: HTMLElement, before: boolean): { node: Node; offset: number } {
  const parent = el.parentNode as Node;
  const index = Array.prototype.indexOf.call(parent.childNodes, el);
  return { node: parent, offset: before ? index : index + 1 };
}

export const EmojiInput = forwardRef<EmojiInputHandle, EmojiInputProps>(function EmojiInput(
  { className, placeholder, maxLength, disabled, singleLine, 'aria-invalid': ariaInvalid, onInput, onKeyDown, onPaste },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null);
  // Latest onInput, read through a ref so the imperative handle (created once)
  // never calls a stale handler (which would carry an old conversation id etc.).
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  // Last caret position known to be inside the field. Saved when focus leaves
  // (e.g. the emoji picker steals it) so a picked emoji is inserted where the
  // user was typing instead of being appended at the very end.
  const savedCaretRef = useRef<{ start: number; end: number } | null>(null);

  /** Read the current selection, clamped to inside our root. */
  function currentOffsets(): { start: number; end: number } {
    const root = divRef.current;
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!root || !sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      const end = root ? serialize(root).length : 0;
      return { start: end, end };
    }
    const a = caretToOffset(root, sel.anchorNode!, sel.anchorOffset);
    const f = caretToOffset(root, sel.focusNode!, sel.focusOffset);
    return { start: Math.min(a, f), end: Math.max(a, f) };
  }

  /** Remember the caret while it's inside the field (see savedCaretRef). */
  function saveCaret() {
    const root = divRef.current;
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!root || !sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return;
    savedCaretRef.current = currentOffsets();
  }

  /**
   * Move the caret across an emoji chip as a single unit. Returns true when it
   * handled the key. This makes an emoji behave like one character for the
   * arrow keys and lets the caret reach the position *before* a leading chip,
   * which the browser won't otherwise allow (a contenteditable=false image has
   * no native caret slot in front of it when it starts the line).
   */
  function moveCaretOverChip(dir: -1 | 1): boolean {
    const root = divRef.current;
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!root || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const { startContainer: c, startOffset: o } = sel.getRangeAt(0);
    if (!root.contains(c)) return false;

    let chip: Node | null = null;
    if (c.nodeType === Node.TEXT_NODE) {
      const len = (c.nodeValue ?? '').length;
      // Still inside the text run → let the browser move by one character.
      if (dir < 0 ? o > 0 : o < len) return false;
      chip = dir < 0 ? c.previousSibling : c.nextSibling;
    } else {
      chip = dir < 0 ? (c.childNodes[o - 1] ?? null) : (c.childNodes[o] ?? null);
    }
    if (!isChip(chip)) return false;

    const parent = chip.parentNode!;
    const idx = Array.prototype.indexOf.call(parent.childNodes, chip);
    const range = document.createRange();
    range.setStart(parent, dir < 0 ? idx : idx + 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  function setCaret(start: number, end: number) {
    const root = divRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel) return;
    const a = offsetToCaret(root, start);
    const b = offsetToCaret(root, end);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function render(text: string) {
    const root = divRef.current;
    if (!root) return;
    root.textContent = '';
    buildNodes(text).forEach((n) => root.appendChild(n));
    syncEmpty();
  }

  function syncEmpty() {
    const root = divRef.current;
    if (!root) return;
    const empty = serialize(root).length === 0;
    // Deleting the last chip or character often leaves the browser's own
    // residue behind (a stray <br> or empty text node). That keeps a phantom
    // caret sitting after/below the placeholder and makes an empty field look
    // like it holds text. When the serialized value is empty, strip the residue
    // so the field resets to a truly-empty state with the caret at the start.
    if (empty && root.childNodes.length > 0) {
      root.textContent = '';
    }
    root.setAttribute('data-empty', empty ? 'true' : 'false');
  }

  function insertAtCaret(text: string) {
    const root = divRef.current;
    if (!root) return;
    root.focus();
    const sel = window.getSelection();
    if (!sel) return;

    // Resolve where to insert. Prefer the live caret; if focus was elsewhere
    // (the emoji picker), fall back to the caret we saved on blur so the emoji
    // lands where the user was typing — not appended at the end.
    let range: Range;
    if (sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else if (savedCaretRef.current) {
      const { start, end } = savedCaretRef.current;
      const a = offsetToCaret(root, start);
      const b = offsetToCaret(root, end);
      range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
    } else {
      range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false); // no known caret → end of the field
    }

    range.deleteContents();
    const frag = document.createDocumentFragment();
    const built = buildNodes(text);
    built.forEach((n) => frag.appendChild(n));
    const lastNode = built[built.length - 1] ?? null;
    range.insertNode(frag);
    if (lastNode) {
      const after = document.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    }
    savedCaretRef.current = currentOffsets();
    syncEmpty();
    onInputRef.current?.();
  }

  // The handle only ever reads from refs (divRef / onInputRef), so creating it
  // once is correct — the exhaustive-deps hint is a false positive here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, (): EmojiInputHandle => ({
    get value() { const r = divRef.current; return r ? serialize(r) : ''; },
    set value(v: string) { render(v ?? ''); },
    get selectionStart() { return currentOffsets().start; },
    get selectionEnd() { return currentOffsets().end; },
    setSelectionRange(start: number, end = start) { setCaret(start, end); },
    focus() { divRef.current?.focus(); },
    blur() { divRef.current?.blur(); },
    get scrollHeight() { return divRef.current?.scrollHeight ?? 0; },
    get style() { return (divRef.current as HTMLDivElement).style; },
    insertAtCaret,
  }), []);

  useEffect(() => { syncEmpty(); }, []);

  function handleBeforeInput(e: React.FormEvent<HTMLDivElement>) {
    // Enforce maxLength on the serialized text.
    if (!maxLength) return;
    const root = divRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const native = e.nativeEvent as any;
    if (root && native?.data && serialize(root).length >= maxLength) {
      e.preventDefault();
    }
  }

  function handleKeyDownInternal(e: React.KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    // Treat an emoji as one character for the arrow keys (and reach the slot
    // before a leading chip). Shift+Arrow is left to the browser so selection
    // extension keeps working.
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      if (moveCaretOverChip(e.key === 'ArrowLeft' ? -1 : 1)) {
        e.preventDefault();
        saveCaret();
        return;
      }
    }
    if (e.key === 'Enter') {
      // Single-line fields never accept newlines; multi-line inserts a real
      // "\n" so the DOM stays flat (text + chips) instead of <div>/<br>.
      e.preventDefault();
      if (!singleLine) insertAtCaret('\n');
    }
  }

  function handlePasteInternal(e: React.ClipboardEvent<HTMLDivElement>) {
    onPaste?.(e);
    if (e.defaultPrevented) return;
    // Force plain-text paste so the DOM stays text + chips only.
    e.preventDefault();
    let text = e.clipboardData?.getData('text/plain') ?? '';
    if (singleLine) text = text.replace(/[\r\n]+/g, ' ');
    if (text) insertAtCaret(text);
  }

  return (
    <div
      ref={divRef}
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck
      aria-invalid={ariaInvalid}
      data-placeholder={placeholder}
      onInput={() => { syncEmpty(); saveCaret(); onInput?.(); }}
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDownInternal}
      onKeyUp={saveCaret}
      onMouseUp={saveCaret}
      onBlur={saveCaret}
      onPaste={handlePasteInternal}
      className={cn('ei-root break-words', singleLine ? 'ei-single whitespace-nowrap overflow-x-auto' : 'whitespace-pre-wrap', className)}
    />
  );
});

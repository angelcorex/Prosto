/**
 * Server permission bits — must mirror the bitmask used in the SQL helpers
 * (migration 20260621000066). The owner implicitly has all of them.
 */
import type { CSSProperties } from 'react';

export const PERM = {
  MANAGE_CHANNELS: 1,
  MANAGE_ROLES: 2,
  MANAGE_SERVER: 4,
  CREATE_INVITE: 8,
  SEND_MESSAGES: 16,
  USE_EMOJI: 32,
  MANAGE_MESSAGES: 64,
  READ_HISTORY: 128,
  MENTION_EVERYONE: 256,
  USE_GIF: 512,
  CHANGE_THEME: 1024,
  ADD_REACTIONS: 2048,
  KICK: 4096,
  BAN: 8192,
  TIMEOUT: 16384,
  ADMINISTRATOR: 32768,
  MANAGE_INVITES: 65536,
} as const;

export type PermKey = keyof typeof PERM;

/** Order shown in the role editor. */
export const PERM_LIST: PermKey[] = [
  'MANAGE_SERVER',
  'MANAGE_ROLES',
  'MANAGE_CHANNELS',
  'MANAGE_MESSAGES',
  'CREATE_INVITE',
  'SEND_MESSAGES',
  'USE_EMOJI',
  'USE_GIF',
  'ADD_REACTIONS',
  'READ_HISTORY',
  'MENTION_EVERYONE',
];

/** True if a permission mask contains a bit. */
export function hasPerm(mask: number | null | undefined, bit: number): boolean {
  return ((Number(mask) || 0) & bit) !== 0;
}

/**
 * Full permission tree shown in the role editor. Nodes with a `bit` are
 * enforced (stored in the `permissions` bitmask); nodes without one are
 * visual-only for now (stored by key in `extra_perms`) and not yet enforced.
 * Some nodes have a `children` branch of finer-grained sub-permissions.
 */
export interface PermNode { key: string; bit?: number; hasDesc?: boolean; children?: PermNode[] }
export interface PermGroup { key: string; note?: string; nodes: PermNode[] }

export const PERM_TREE: PermGroup[] = [
  { key: 'general', nodes: [
    { key: 'VIEW_CHANNELS' },
    { key: 'READ_ONLY' },
    { key: 'VIEW_AUDIT_LOG' },
    { key: 'CHANGE_NICKNAME', children: [{ key: 'NICK_OWN' }, { key: 'NICK_OTHERS' }] },
  ] },
  { key: 'members', nodes: [
    { key: 'KICK', bit: 4096, hasDesc: true },
    { key: 'BAN', bit: 8192, hasDesc: true },
    { key: 'TIMEOUT', bit: 16384, hasDesc: true },
  ] },
  { key: 'messages', nodes: [
    { key: 'SEND_MESSAGES', bit: 16, hasDesc: true },
    { key: 'READ_HISTORY', bit: 128, hasDesc: true },
    { key: 'USE_EMOJI', bit: 32, hasDesc: true },
    { key: 'USE_GIF', bit: 512, hasDesc: true },
    { key: 'ADD_REACTIONS', bit: 2048, hasDesc: true },
    { key: 'SEND_REPLIES' },
    { key: 'CREATE_POLLS' },
    { key: 'MENTION_EVERYONE', bit: 256, hasDesc: true },
    { key: 'MANAGE_MESSAGES', bit: 64, hasDesc: true, children: [
      { key: 'PIN_MESSAGES' }, { key: 'DELETE_OTHERS' }, { key: 'DELETE_OWN' }, { key: 'EDIT_OWN' },
    ] },
  ] },
  { key: 'channels', nodes: [
    { key: 'CHANGE_THEME', bit: 1024, hasDesc: true },
    { key: 'MANAGE_CHANNELS', bit: 1, hasDesc: true, children: [
      { key: 'CREATE_CHANNELS' }, { key: 'EDIT_CHANNELS' }, { key: 'DELETE_CHANNELS' }, { key: 'MANAGE_CHANNEL_TOPIC' },
    ] },
  ] },
  { key: 'roles', note: 'MANAGE_ROLES', nodes: [
    { key: 'MANAGE_ROLES', bit: 2, hasDesc: true, children: [
      { key: 'ASSIGN_ROLES' }, { key: 'REMOVE_ROLES' }, { key: 'EDIT_ROLE_PERMS' },
    ] },
  ] },
  { key: 'voice', nodes: [
    { key: 'VOICE_MUTE' }, { key: 'VOICE_DEAFEN' }, { key: 'VIDEO' },
  ] },
  { key: 'server', nodes: [
    { key: 'MANAGE_SERVER', bit: 4, hasDesc: true, children: [
      { key: 'SERVER_NAME' }, { key: 'SERVER_ICON' }, { key: 'SERVER_DESCRIPTION' },
    ] },
    { key: 'CREATE_INVITE', bit: 8, hasDesc: true },
    { key: 'MANAGE_INVITES', bit: 65536, hasDesc: true },
  ] },
  // Administrator sits on its own at the very bottom: one switch that grants
  // every permission (server_perms/channel_perms expand it to the full mask).
  { key: 'advanced', nodes: [
    { key: 'ADMINISTRATOR', bit: 32768, hasDesc: true },
  ] },
];

/** Preset role colours offered in the editor (also free-form via the input). */
export const ROLE_COLORS = [
  '#f04747', '#f0883e', '#faa61a', '#f1c40f', '#43b581', '#2ecc71',
  '#1abc9c', '#3498db', '#5865f2', '#7c5cff', '#9b59b6', '#e91e63',
  '#e67e22', '#95a5a6', '#607d8b',
] as const;

/** Ready-made gradient templates [start, end] for one-tap selection. */
export const ROLE_GRADIENTS: readonly [string, string][] = [
  ['#7c5cff', '#e91e63'],
  ['#00c6ff', '#0072ff'],
  ['#11998e', '#38ef7d'],
  ['#f7971e', '#ffd200'],
  ['#ee0979', '#ff6a00'],
  ['#fa71cd', '#9b59b6'],
  ['#43cea2', '#185a9d'],
  ['#f857a6', '#ff5858'],
  ['#c471f5', '#fa71cd'],
  ['#2af598', '#009efd'],
] as const;

/** Default gradient offered when a member turns on a gradient with no colour set. */
export const DEFAULT_ROLE_COLOR   = ROLE_GRADIENTS[0]![0];
export const DEFAULT_ROLE_COLOR_2 = ROLE_GRADIENTS[0]![1];

/** Muted dot/label colour shown for a role that has no custom colour. */
export const ROLE_FALLBACK_COLOR = '#8a8a93';

/**
 * Inline style for a role-coloured name. When a second colour is present the
 * name becomes a clipped, slowly-shimmering linear gradient; otherwise it's a
 * flat colour. An optional glow renders as a soft backlight behind the text.
 * (Dynamic colour styles are the one place inline styles are allowed.)
 */
export function roleNameStyle(
  color?: string | null,
  color2?: string | null,
  glow?: string | null,
): CSSProperties {
  const style: CSSProperties = {};
  if (color && color2) {
    // Triple stop so the shimmer (background-position 0→200%) loops seamlessly.
    style.backgroundImage = `linear-gradient(90deg, ${color}, ${color2}, ${color})`;
    style.backgroundSize = '200% auto';
    style.WebkitBackgroundClip = 'text';
    style.backgroundClip = 'text';
    style.color = 'transparent';
  } else if (color) {
    style.color = color;
  }
  if (glow) {
    // Wider, denser back glow (two stacked shadows) that works for both solid
    // and clipped-gradient text.
    style.filter = `drop-shadow(0 0 7px ${glow}) drop-shadow(0 0 14px ${glow})`;
  }
  return style;
}

/** Class that animates the gradient shimmer (only meaningful with two colours). */
export function roleNameClass(color?: string | null, color2?: string | null): string | undefined {
  return color && color2 ? 'role-grad-shimmer' : undefined;
}
